import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { extractPdfText } from "@/lib/pdf";
import { generateFromNotes } from "@/lib/llm";
import { rateLimit, getClientIp } from "@/lib/ratelimit";

export const runtime = "nodejs";
export const maxDuration = 60;

const MAX_FILE_BYTES = 10 * 1024 * 1024; // 10 MB

type Body = {
  filename?: string;
  size?: number;
  storagePath?: string;
};

export async function POST(req: Request) {
  try {
    const supabase = createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    // Per-user + per-IP rate limit (5 uploads per minute)
    const rl = rateLimit(`upload:${user.id}:${getClientIp(req)}`, 5, 60_000);
    if (!rl.success) {
      return NextResponse.json(
        { error: "Too many uploads. Try again shortly." },
        { status: 429 }
      );
    }

    const body = (await req.json().catch(() => ({}))) as Body;
    const filename = (body.filename ?? "").toString().slice(0, 255);
    const size = Number(body.size ?? 0);
    const storagePath = (body.storagePath ?? "").toString();

    if (!filename || !storagePath) {
      return NextResponse.json(
        { error: "filename and storagePath are required" },
        { status: 400 }
      );
    }
    if (!storagePath.startsWith(`${user.id}/`)) {
      return NextResponse.json(
        { error: "Storage path does not belong to you." },
        { status: 403 }
      );
    }
    if (size > MAX_FILE_BYTES) {
      return NextResponse.json(
        { error: `File exceeds ${MAX_FILE_BYTES / 1024 / 1024}MB limit` },
        { status: 400 }
      );
    }

    // 1. Create upload row (status=processing)
    const { data: upload, error: insertErr } = await supabase
      .from("uploads")
      .insert({
        user_id: user.id,
        filename,
        size_bytes: size,
        text_length: 0,
        status: "processing",
        storage_path: storagePath,
      })
      .select("*")
      .single();

    if (insertErr || !upload) {
      return NextResponse.json(
        { error: insertErr?.message ?? "Failed to create upload" },
        { status: 500 }
      );
    }

    try {
      // 2. Download the PDF from Supabase Storage.
      const { data: blob, error: dlErr } = await supabase.storage
        .from("pdfs")
        .download(storagePath);
      if (dlErr || !blob) {
        throw new Error(dlErr?.message ?? "Could not read uploaded PDF.");
      }
      const buffer = Buffer.from(await blob.arrayBuffer());

      // 3. Extract text.
      const text = await extractPdfText(buffer);
      if (!text || text.length < 50) {
        throw new Error("Could not extract enough text from PDF.");
      }

      // 4. Generate via LLM.
      const { summary, mcqs, flashcards } = await generateFromNotes(text);
      if (!mcqs.length) throw new Error("AI did not return any questions.");

      // 5. Persist quiz + flashcards.
      const { error: quizErr } = await supabase.from("quizzes").insert({
        upload_id: upload.id,
        user_id: user.id,
        summary,
        mcqs,
      });
      if (quizErr) throw new Error(quizErr.message);

      if (flashcards.length) {
        const rows = flashcards.map((f) => ({
          upload_id: upload.id,
          user_id: user.id,
          front: f.front,
          back: f.back,
        }));
        const { error: fcErr } = await supabase.from("flashcards").insert(rows);
        if (fcErr) throw new Error(fcErr.message);
      }

      // 6. Mark upload ready.
      await supabase
        .from("uploads")
        .update({ status: "ready", text_length: text.length })
        .eq("id", upload.id);

      return NextResponse.json({ uploadId: upload.id });
    } catch (err: any) {
      await supabase
        .from("uploads")
        .update({ status: "failed", error: err?.message ?? "Processing failed" })
        .eq("id", upload.id);
      return NextResponse.json(
        { error: err?.message ?? "Processing failed" },
        { status: 500 }
      );
    }
  } catch (err: any) {
    return NextResponse.json(
      { error: err?.message ?? "Unexpected error" },
      { status: 500 }
    );
  }
}
