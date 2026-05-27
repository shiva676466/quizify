import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { generateMcqs } from "@/lib/llm";
import { rateLimit, getClientIp } from "@/lib/ratelimit";

export const runtime = "nodejs";
export const maxDuration = 60;

// Step 3 of 4: generate the 10 MCQs from the cached notes_text.
export async function POST(req: Request) {
  try {
    const supabase = createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const rl = rateLimit(`proc-mcq:${user.id}:${getClientIp(req)}`, 10, 60_000);
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
      .select("id")
      .eq("upload_id", uploadId)
      .eq("user_id", user.id)
      .single();
    if (!quiz) {
      return NextResponse.json({ error: "Quiz row not found." }, { status: 404 });
    }

    const mcqs = await generateMcqs(upload.notes_text);
    if (!mcqs.length) {
      return NextResponse.json(
        { error: "AI did not return any questions." },
        { status: 500 }
      );
    }

    const { error: updErr } = await supabase
      .from("quizzes")
      .update({ mcqs })
      .eq("id", quiz.id);
    if (updErr) {
      return NextResponse.json({ error: updErr.message }, { status: 500 });
    }

    return NextResponse.json({ count: mcqs.length });
  } catch (err: any) {
    return NextResponse.json(
      { error: err?.message ?? "Unexpected error" },
      { status: 500 }
    );
  }
}
