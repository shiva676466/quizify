import Link from "next/link";
import { redirect } from "next/navigation";
import { Navbar } from "@/components/Navbar";
import { Footer } from "@/components/Footer";
import { createClient } from "@/lib/supabase/server";
import {
  ArrowRight,
  BookOpen,
  Brain,
  FileText,
  Sparkles,
  Zap,
  ShieldCheck,
  LayoutDashboard,
} from "lucide-react";

export const dynamic = "force-dynamic";

export default async function LandingPage() {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/signup");
  }

  const greeting =
    (user.user_metadata?.full_name as string | undefined) ?? user.email;

  return (
    <div className="min-h-dvh flex flex-col">
      <Navbar />

      <main className="flex-1">
        {/* Hero */}
        <section className="relative overflow-hidden">
          <div className="absolute inset-0 -z-10 bg-gradient-mesh opacity-70" />
          <div className="mx-auto max-w-5xl px-4 py-20 sm:py-28 text-center animate-fade-in">
            <span className="inline-flex items-center gap-1.5 rounded-full border border-border bg-card px-3 py-1 text-xs font-medium text-muted-foreground shadow-sm">
              <Sparkles className="h-3.5 w-3.5 text-primary" />
              Welcome back{greeting ? `, ${greeting}` : ""}
            </span>

            <h1 className="mt-6 text-4xl sm:text-6xl font-bold tracking-tight">
              Turn PDF notes into{" "}
              <span className="gradient-text">quizzes & flashcards</span> in seconds.
            </h1>

            <p className="mx-auto mt-5 max-w-2xl text-base sm:text-lg text-muted-foreground">
              Drop a PDF on your dashboard and Quizify generates a clean summary,
              ten multiple-choice questions, and a deck of flashcards.
            </p>

            <div className="mt-8 flex flex-col sm:flex-row items-center justify-center gap-3">
              <Link href="/dashboard" className="btn-primary">
                <LayoutDashboard className="h-4 w-4" />
                Go to dashboard
              </Link>
              <Link href="/dashboard" className="btn-outline">
                Upload a new PDF <ArrowRight className="h-4 w-4" />
              </Link>
            </div>

            <div className="mt-12 mx-auto max-w-3xl">
              <div className="rounded-2xl border border-border bg-card/70 backdrop-blur p-1 shadow-2xl">
                <div className="rounded-xl bg-gradient-to-br from-indigo-500/10 via-purple-500/10 to-pink-500/10 p-8 sm:p-12">
                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 text-left">
                    {[
                      { icon: FileText, label: "Summary" },
                      { icon: Brain, label: "10 MCQs" },
                      { icon: BookOpen, label: "Flashcards" },
                    ].map(({ icon: Icon, label }) => (
                      <div
                        key={label}
                        className="rounded-xl border border-border bg-card p-4 shadow-sm"
                      >
                        <Icon className="h-5 w-5 text-primary" />
                        <p className="mt-3 font-semibold">{label}</p>
                        <p className="mt-1 text-xs text-muted-foreground">
                          Auto-generated from your PDF.
                        </p>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            </div>
          </div>
        </section>

        {/* Features */}
        <section className="mx-auto max-w-6xl px-4 py-16">
          <div className="grid sm:grid-cols-3 gap-6">
            <Feature
              icon={Zap}
              title="Blazing fast"
              text="Most PDFs are processed in under 30 seconds."
            />
            <Feature
              icon={ShieldCheck}
              title="Private by default"
              text="Per-user row-level security on Supabase. Your data stays yours."
            />
            <Feature
              icon={Sparkles}
              title="High-quality output"
              text="Open-source LLMs generate accurate, exam-style questions and crisp summaries."
            />
          </div>
        </section>

        {/* How it works */}
        <section className="mx-auto max-w-6xl px-4 pb-20">
          <h2 className="text-2xl sm:text-3xl font-bold text-center">
            How it works
          </h2>
          <div className="mt-8 grid sm:grid-cols-3 gap-6">
            {[
              {
                n: "1",
                t: "Upload your PDF",
                d: "Drop your lecture notes or textbook chapter (up to 10MB).",
              },
              {
                n: "2",
                t: "AI processes",
                d: "We extract the text and generate a summary, quiz, and deck.",
              },
              {
                n: "3",
                t: "Study away",
                d: "Practice MCQs, flip flashcards, export to PDF, repeat.",
              },
            ].map((s) => (
              <div key={s.n} className="card p-6">
                <span className="inline-flex h-8 w-8 items-center justify-center rounded-lg bg-primary/10 text-primary font-semibold">
                  {s.n}
                </span>
                <h3 className="mt-4 font-semibold">{s.t}</h3>
                <p className="mt-1 text-sm text-muted-foreground">{s.d}</p>
              </div>
            ))}
          </div>

          <div className="mt-12 text-center">
            <Link href="/dashboard" className="btn-primary">
              Open your dashboard <ArrowRight className="h-4 w-4" />
            </Link>
          </div>
        </section>
      </main>

      <Footer />
    </div>
  );
}

function Feature({
  icon: Icon,
  title,
  text,
}: {
  icon: any;
  title: string;
  text: string;
}) {
  return (
    <div className="card p-6">
      <div className="inline-flex h-10 w-10 items-center justify-center rounded-lg bg-primary/10 text-primary">
        <Icon className="h-5 w-5" />
      </div>
      <h3 className="mt-4 font-semibold">{title}</h3>
      <p className="mt-1 text-sm text-muted-foreground">{text}</p>
    </div>
  );
}
