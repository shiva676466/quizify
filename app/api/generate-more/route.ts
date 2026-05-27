import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { generateMoreMcqs } from "@/lib/llm";
import { rateLimit, getClientIp } from "@/lib/ratelimit";
import { extractPdfText } from "@/lib/pdf";
import type { MCQ } from "@/types";

export const runtime = "nodejs";
export const maxDuration = 60;

// Generate additional MCQs for an existing upload.
// Body: { uploadId: string, notesText?: string }
// We accept optional notesText so the client can re-supply text without re-uploading the file
// (since we don't store the raw PDF). If not provided we return 400.
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

    const contentType = req.headers.get("content-type") || "";
    let uploadId = "";
    let notesText = "";

    if (contentType.includes("multipart/form-data")) {
      const form = await req.formData();
      uploadId = String(form.get("uploadId") ?? "");
      const file = form.get("file");
      if (file instanceof File && file.type === "application/pdf") {
        const buf = Buffer.from(await file.arrayBuffer());
        notesText = await extractPdfText(buf);
      }
    } else {
      const body = await req.json().catch(() => ({}));
      uploadId = String(body?.uploadId ?? "");
      notesText = String(body?.notesText ?? "");
    }

    if (!uploadId) {
      return NextResponse.json({ error: "uploadId required" }, { status: 400 });
    }
    if (!notesText || notesText.length < 50) {
      return NextResponse.json(
        {
          error:
            "Notes text required. Re-upload the PDF or paste the source text to generate more.",
        },
        { status: 400 }
      );
    }

    // Verify ownership and load existing quiz
    const { data: quiz, error: qErr } = await supabase
      .from("quizzes")
      .select("id, mcqs, upload_id, user_id")
      .eq("upload_id", uploadId)
      .eq("user_id", user.id)
      .single();

    if (qErr || !quiz) {
      return NextResponse.json({ error: "Quiz not found" }, { status: 404 });
    }

    const existing: MCQ[] = Array.isArray(quiz.mcqs) ? (quiz.mcqs as MCQ[]) : [];
    const existingQs = existing.map((m) => m.question);

    const more = await generateMoreMcqs(notesText, existingQs);
    if (!more.length) {
      return NextResponse.json({ error: "AI returned no new questions" }, { status: 500 });
    }

    const merged = [...existing, ...more];

    const { error: updErr } = await supabase
      .from("quizzes")
      .update({ mcqs: merged })
      .eq("id", quiz.id);

    if (updErr) {
      return NextResponse.json({ error: updErr.message }, { status: 500 });
    }

    return NextResponse.json({ added: more.length, total: merged.length, mcqs: merged });
  } catch (err: any) {
    return NextResponse.json(
      { error: err?.message ?? "Unexpected error" },
      { status: 500 }
    );
  }
}
