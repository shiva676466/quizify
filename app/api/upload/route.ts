import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { extractPdfText } from "@/lib/pdf";
import { rateLimit, getClientIp } from "@/lib/ratelimit";
import type { SummaryMode } from "@/types";

export const runtime = "nodejs";
export const maxDuration = 60;

const MAX_FILE_BYTES = 10 * 1024 * 1024; // 10 MB

type Body = {
  filename?: string;
  size?: number;
  storagePath?: string;
  summaryMode?: SummaryMode;
};

// Step 1 of 4: download the PDF from Supabase Storage, extract text, persist
// it on the upload row. NO LLM call — keeps this endpoint fast and within the
// platform timeout regardless of plan.
export async function POST(req: Request) {
  try {
    const supabase = createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

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
    const summaryMode: SummaryMode =
      body.summaryMode === "exam" ? "exam" : "general";

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

    // Insert the upload row up front.
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
      // Download + extract.
      const { data: blob, error: dlErr } = await supabase.storage
        .from("pdfs")
        .download(storagePath);
      if (dlErr || !blob) {
        throw new Error(dlErr?.message ?? "Could not read uploaded PDF.");
      }
      const buffer = Buffer.from(await blob.arrayBuffer());
      const text = await extractPdfText(buffer);
      if (!text || text.length < 50) {
        throw new Error("Could not extract enough text from PDF.");
      }

      // Persist text so the subsequent process-* endpoints can re-use it
      // without re-downloading.
      await supabase
        .from("uploads")
        .update({ text_length: text.length, notes_text: text })
        .eq("id", upload.id);

      // Create a placeholder quiz row carrying the chosen summary mode.
      // Each process step will fill in its piece.
      await supabase.from("quizzes").insert({
        upload_id: upload.id,
        user_id: user.id,
        summary: "",
        summary_mode: summaryMode,
        mcqs: [],
      });

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
