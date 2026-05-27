import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { generateFlashcards } from "@/lib/llm";
import { rateLimit, getClientIp } from "@/lib/ratelimit";

export const runtime = "nodejs";
export const maxDuration = 60;

// Step 4 of 4: generate flashcards, mark the upload as ready.
export async function POST(req: Request) {
  try {
    const supabase = createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const rl = rateLimit(`proc-fc:${user.id}:${getClientIp(req)}`, 10, 60_000);
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

    const cards = await generateFlashcards(upload.notes_text);
    if (!cards.length) {
      // Soft-fail: still mark ready since the rest of the quiz works.
      await supabase
        .from("uploads")
        .update({ status: "ready" })
        .eq("id", upload.id);
      return NextResponse.json({ count: 0 });
    }

    const rows = cards.map((f) => ({
      upload_id: upload.id,
      user_id: user.id,
      front: f.front,
      back: f.back,
    }));
    const { error: fcErr } = await supabase.from("flashcards").insert(rows);
    if (fcErr) {
      return NextResponse.json({ error: fcErr.message }, { status: 500 });
    }

    await supabase
      .from("uploads")
      .update({ status: "ready" })
      .eq("id", upload.id);

    return NextResponse.json({ count: cards.length });
  } catch (err: any) {
    return NextResponse.json(
      { error: err?.message ?? "Unexpected error" },
      { status: 500 }
    );
  }
}
