import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { Navbar } from "@/components/Navbar";
import { Footer } from "@/components/Footer";
import { MCQList } from "@/components/MCQList";
import { FlashcardDeck } from "@/components/FlashcardDeck";
import { QuizActions } from "@/components/QuizActions";
import { SummaryModeSwitch } from "@/components/SummaryModeSwitch";
import { createClient } from "@/lib/supabase/server";
import type { Flashcard, MCQ, SummaryMode } from "@/types";

export const dynamic = "force-dynamic";

export default async function QuizPage({ params }: { params: { id: string } }) {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect(`/login?redirectTo=/quiz/${params.id}`);

  const { data: upload } = await supabase
    .from("uploads")
    .select("*")
    .eq("id", params.id)
    .single();

  if (!upload) notFound();

  const { data: quiz } = await supabase
    .from("quizzes")
    .select("*")
    .eq("upload_id", params.id)
    .single();

  const { data: flashcards } = await supabase
    .from("flashcards")
    .select("*")
    .eq("upload_id", params.id)
    .order("created_at", { ascending: true });

  const mcqs: MCQ[] = (quiz?.mcqs as MCQ[]) ?? [];
  const cards: Flashcard[] = (flashcards ?? []).map((f: any) => ({
    front: f.front,
    back: f.back,
  }));

  return (
    <div className="min-h-dvh flex flex-col">
      <Navbar />

      <main className="flex-1">
        <div className="mx-auto max-w-4xl px-4 py-8 space-y-8">
          {/* Header */}
          <div>
            <Link
              href="/dashboard"
              className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
            >
              <ArrowLeft className="h-4 w-4" /> Back to dashboard
            </Link>
            <h1 className="mt-3 text-2xl sm:text-3xl font-bold tracking-tight">
              {upload.filename}
            </h1>
            <p className="mt-1 text-sm text-muted-foreground">
              Generated {new Date(upload.created_at).toLocaleString()}
            </p>

            <div className="mt-4">
              {quiz && (
                <QuizActions
                  uploadId={upload.id}
                  summary={quiz.summary ?? ""}
                  mcqs={mcqs}
                  flashcards={cards}
                  filename={upload.filename}
                />
              )}
            </div>
          </div>

          {/* Summary */}
          <section className="card p-6">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <h2 className="text-xl font-semibold">Summary</h2>
              {quiz && (
                <SummaryModeSwitch
                  uploadId={upload.id}
                  current={(quiz.summary_mode as SummaryMode) ?? "general"}
                />
              )}
            </div>
            <p className="mt-3 whitespace-pre-wrap leading-relaxed text-sm sm:text-base">
              {quiz?.summary || "No summary available."}
            </p>
          </section>

          {/* MCQs */}
          <section>
            <MCQList mcqs={mcqs} />
          </section>

          {/* Flashcards */}
          <section className="card p-6">
            <FlashcardDeck cards={cards} />
          </section>
        </div>
      </main>

      <Footer />
    </div>
  );
}
