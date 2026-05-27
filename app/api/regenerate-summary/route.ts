import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { extractPdfText } from "@/lib/pdf";
import { generateSummary } from "@/lib/llm";
import { rateLimit, getClientIp } from "@/lib/ratelimit";
import type { SummaryMode } from "@/types";

export const runtime = "nodejs";
export const maxDuration = 60;

// POST /api/regenerate-summary
// Body: { uploadId: string, mode: "general" | "exam" }
// Re-reads the source PDF from storage, regenerates JUST the summary in the
// requested style, and updates the quiz row. MCQs and flashcards are untouched.
export async function POST(req: Request) {
  try {
    const supabase = createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const rl = rateLimit(`regen-sum:${user.id}:${getClientIp(req)}`, 10, 60_000);
    if (!rl.success) {
      return NextResponse.json(
        { error: "Too many requests. Slow down." },
        { status: 429 }
      );
    }

    const body = (await req.json().catch(() => ({}))) as {
      uploadId?: string;
      mode?: SummaryMode;
    };
    const uploadId = String(body?.uploadId ?? "");
    const mode: SummaryMode = body?.mode === "exam" ? "exam" : "general";
    if (!uploadId) {
      return NextResponse.json({ error: "uploadId required" }, { status: 400 });
    }

    const { data: upload, error: uErr } = await supabase
      .from("uploads")
      .select("id, user_id, storage_path")
      .eq("id", uploadId)
      .eq("user_id", user.id)
      .single();
    if (uErr || !upload) {
      return NextResponse.json({ error: "Upload not found" }, { status: 404 });
    }
    if (!upload.storage_path) {
      return NextResponse.json(
        { error: "Source PDF is not available for this upload." },
        { status: 400 }
      );
    }

    const { data: quiz, error: qErr } = await supabase
      .from("quizzes")
      .select("id")
      .eq("upload_id", uploadId)
      .eq("user_id", user.id)
      .single();
    if (qErr || !quiz) {
      return NextResponse.json({ error: "Quiz not found" }, { status: 404 });
    }

    const { data: blob, error: dlErr } = await supabase.storage
      .from("pdfs")
      .download(upload.storage_path);
    if (dlErr || !blob) {
      return NextResponse.json(
        { error: dlErr?.message ?? "Could not read stored PDF." },
        { status: 500 }
      );
    }
    const buffer = Buffer.from(await blob.arrayBuffer());
    const text = await extractPdfText(buffer);
    if (!text || text.length < 50) {
      return NextResponse.json(
        { error: "Could not extract enough text from PDF." },
        { status: 400 }
      );
    }

    const summary = await generateSummary(text, mode);
    if (!summary) {
      return NextResponse.json(
        { error: "AI returned an empty summary." },
        { status: 500 }
      );
    }

    const { error: updErr } = await supabase
      .from("quizzes")
      .update({ summary, summary_mode: mode })
      .eq("id", quiz.id);
    if (updErr) {
      return NextResponse.json({ error: updErr.message }, { status: 500 });
    }

    return NextResponse.json({ summary, mode });
  } catch (err: any) {
    return NextResponse.json(
      { error: err?.message ?? "Unexpected error" },
      { status: 500 }
    );
  }
}
