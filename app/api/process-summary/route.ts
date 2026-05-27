import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { generateSummary } from "@/lib/llm";
import { rateLimit, getClientIp } from "@/lib/ratelimit";
import type { SummaryMode } from "@/types";

export const runtime = "nodejs";
export const maxDuration = 60;

// Step 2 of 4: generate the summary from the cached notes_text.
export async function POST(req: Request) {
  try {
    const supabase = createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const rl = rateLimit(`proc-sum:${user.id}:${getClientIp(req)}`, 10, 60_000);
    if (!rl.success) {
      return NextResponse.json(
        { error: "Too many requests. Slow down." },
        { status: 429 }
      );
    }

    const { uploadId } = (await req.json().catch(() => ({}))) as {
      uploadId?: string;
    };
    if (!uploadId) {
      return NextResponse.json({ error: "uploadId required" }, { status: 400 });
    }

    const { data: upload, error: uErr } = await supabase
      .from("uploads")
      .select("id, user_id, notes_text")
      .eq("id", uploadId)
      .eq("user_id", user.id)
      .single();
    if (uErr || !upload?.notes_text) {
      return NextResponse.json(
        { error: "Notes text not available." },
        { status: 400 }
      );
    }

    const { data: quiz } = await supabase
      .from("quizzes")
      .select("id, summary_mode")
      .eq("upload_id", uploadId)
      .eq("user_id", user.id)
      .single();
    if (!quiz) {
      return NextResponse.json({ error: "Quiz row not found." }, { status: 404 });
    }

    const mode: SummaryMode = quiz.summary_mode === "exam" ? "exam" : "general";
    const summary = await generateSummary(upload.notes_text, mode);
    if (!summary) {
      return NextResponse.json({ error: "AI returned empty summary." }, { status: 500 });
    }

    const { error: updErr } = await supabase
      .from("quizzes")
      .update({ summary })
      .eq("id", quiz.id);
    if (updErr) {
      return NextResponse.json({ error: updErr.message }, { status: 500 });
    }

    return NextResponse.json({ summary });
  } catch (err: any) {
    return NextResponse.json(
      { error: err?.message ?? "Unexpected error" },
      { status: 500 }
    );
  }
}
