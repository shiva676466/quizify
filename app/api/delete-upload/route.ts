import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

export const runtime = "nodejs";

export async function POST(req: Request) {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { uploadId } = (await req.json().catch(() => ({}))) as { uploadId?: string };
  if (!uploadId) {
    return NextResponse.json({ error: "uploadId required" }, { status: 400 });
  }

  // Read storage_path first so we can clean up the PDF from Storage.
  const { data: existing } = await supabase
    .from("uploads")
    .select("storage_path")
    .eq("id", uploadId)
    .eq("user_id", user.id)
    .single();

  // RLS ensures only the owner can delete. Cascade removes quizzes + flashcards.
  const { error } = await supabase
    .from("uploads")
    .delete()
    .eq("id", uploadId)
    .eq("user_id", user.id);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  if (existing?.storage_path) {
    // Best-effort: ignore failure so a missing object doesn't block the delete.
    await supabase.storage.from("pdfs").remove([existing.storage_path]).catch(() => {});
  }

  return NextResponse.json({ ok: true });
}
