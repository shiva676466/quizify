import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { generateMoreMcqs } from "@/lib/llm";
import { rateLimit, getClientIp } from "@/lib/ratelimit";
import { extractPdfText } from "@/lib/pdf";
import type { MCQ } from "@/types";

export const runtime = "nodejs";
export const maxDuration = 60;

// Generate additional MCQs for an existing upload by re-reading the PDF
// from Supabase Storage.
// Body: { uploadId: string }
export async function POST(req: Request) {
  try {
    const supabase = createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const rl = rateLimit(`gen-more:${user.id}:${getClientIp(req)}`, 10, 60_000);
    if (!rl.success) {
      return NextResponse.json(
        { error: "Too many requests. Slow down." },
        { status: 429 }
      );
    }

    const body = (await req.json().catch(() => ({}))) as { uploadId?: string };
    const uploadId = String(body?.uploadId ?? "");
    if (!uploadId) {
      return NextResponse.json({ error: "uploadId required" }, { status: 400 });
    }

    // Verify ownership and load the upload + existing quiz.
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
      .select("id, mcqs")
      .eq("upload_id", uploadId)
      .eq("user_id", user.id)
      .single();
    if (qErr || !quiz) {
      return NextResponse.json({ error: "Quiz not found" }, { status: 404 });
    }

    // Re-download the PDF and extract text.
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

    const existing: MCQ[] = Array.isArray(quiz.mcqs) ? (quiz.mcqs as MCQ[]) : [];
    const existingQs = existing.map((m) => m.question);

    const more = await generateMoreMcqs(text, existingQs);
    if (!more.length) {
      return NextResponse.json(
        { error: "AI returned no new questions" },
        { status: 500 }
      );
    }

    const merged = [...existing, ...more];

    const { error: updErr } = await supabase
      .from("quizzes")
      .update({ mcqs: merged })
      .eq("id", quiz.id);

    if (updErr) {
      return NextResponse.json({ error: updErr.message }, { status: 500 });
    }

    return NextResponse.json({
      added: more.length,
      total: merged.length,
      mcqs: merged,
    });
  } catch (err: any) {
    return NextResponse.json(
      { error: err?.message ?? "Unexpected error" },
      { status: 500 }
    );
  }
}
