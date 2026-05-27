import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { extractPdfText } from "@/lib/pdf";
import { generateFromNotes } from "@/lib/llm";
import { rateLimit, getClientIp } from "@/lib/ratelimit";

export const runtime = "nodejs";
export const maxDuration = 60;

// Vercel Hobby caps function request bodies at 4.5 MB; we use 4 MB to leave
// room for multipart overhead. Clients should refuse oversize uploads first.
const MAX_FILE_BYTES = 4 * 1024 * 1024;

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

    const form = await req.formData();
    const file = form.get("file");

    if (!(file instanceof File)) {
      return NextResponse.json({ error: "No file provided" }, { status: 400 });
    }
    if (file.type !== "application/pdf") {
      return NextResponse.json({ error: "Only PDF files are allowed" }, { status: 400 });
    }
    if (file.size > MAX_FILE_BYTES) {
      return NextResponse.json({ error: "File exceeds 10MB limit" }, { status: 400 });
    }

    const buffer = Buffer.from(await file.arrayBuffer());

    // 1. Create upload row (status=processing)
    const { data: upload, error: insertErr } = await supabase
      .from("uploads")
      .insert({
        user_id: user.id,
        filename: file.name,
        size_bytes: file.size,
        text_length: 0,
        status: "processing",
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
      // 2. Extract text
      const text = await extractPdfText(buffer);
      if (!text || text.length < 50) {
        throw new Error("Could not extract enough text from PDF.");
      }

      // 3. Generate via Gemini
      const { summary, mcqs, flashcards } = await generateFromNotes(text);
      if (!mcqs.length) throw new Error("AI did not return any questions.");

      // 4. Persist quiz + flashcards
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

      // 5. Mark upload ready
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
