import Link from "next/link";
import { redirect } from "next/navigation";
import { Navbar } from "@/components/Navbar";
import { Footer } from "@/components/Footer";
import { UploadZone } from "@/components/UploadZone";
import { DeleteUploadButton } from "@/components/DeleteUploadButton";
import { createClient } from "@/lib/supabase/server";
import { formatBytes, formatDate } from "@/lib/utils";
import { FileText, ChevronRight, Sparkles } from "lucide-react";
import type { Upload } from "@/types";

export const metadata = { title: "Dashboard — Quizify" };
export const dynamic = "force-dynamic";

export default async function DashboardPage() {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login?redirectTo=/dashboard");

  const { data: uploads } = await supabase
    .from("uploads")
    .select("*")
    .order("created_at", { ascending: false })
    .limit(50);

  const list = (uploads ?? []) as Upload[];

  return (
    <div className="min-h-dvh flex flex-col">
      <Navbar />

      <main className="flex-1">
        <div className="mx-auto max-w-5xl px-4 py-10 space-y-10">
          {/* Header */}
          <div>
            <h1 className="text-3xl font-bold tracking-tight">
              Welcome back{user.user_metadata?.full_name ? `, ${user.user_metadata.full_name}` : ""}
            </h1>
            <p className="mt-1 text-sm text-muted-foreground">
              Upload a PDF to generate your next study set.
            </p>
          </div>

          <UploadZone />

          {/* History */}
          <section>
            <div className="flex items-center justify-between">
              <h2 className="text-xl font-semibold">Your study sets</h2>
              <span className="text-sm text-muted-foreground">
                {list.length} item{list.length === 1 ? "" : "s"}
              </span>
            </div>

            {list.length === 0 ? (
              <div className="mt-4 card p-10 text-center">
                <Sparkles className="mx-auto h-6 w-6 text-primary" />
                <p className="mt-3 font-medium">No uploads yet</p>
                <p className="mt-1 text-sm text-muted-foreground">
                  Drop a PDF above to generate your first quiz.
                </p>
              </div>
            ) : (
              <ul className="mt-4 grid gap-3 sm:grid-cols-2">
                {list.map((u) => (
                  <li
                    key={u.id}
                    className="card p-4 flex items-center gap-3 group"
                  >
                    <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary">
                      <FileText className="h-5 w-5" />
                    </div>
                    <div className="min-w-0 flex-1">
                      <p className="truncate font-medium" title={u.filename}>
                        {u.filename}
                      </p>
                      <p className="text-xs text-muted-foreground">
                        {formatDate(u.created_at)} · {formatBytes(u.size_bytes)} ·{" "}
                        <span
                          className={
                            u.status === "ready"
                              ? "text-emerald-500"
                              : u.status === "failed"
                                ? "text-red-500"
                                : "text-amber-500"
                          }
                        >
                          {u.status}
                        </span>
                      </p>
                    </div>

                    <DeleteUploadButton uploadId={u.id} />

                    {u.status === "ready" ? (
                      <Link
                        href={`/quiz/${u.id}`}
                        className="rounded-md p-2 text-muted-foreground hover:bg-muted hover:text-foreground transition"
                        aria-label="Open quiz"
                      >
                        <ChevronRight className="h-4 w-4" />
                      </Link>
                    ) : (
                      <span className="w-8" />
                    )}
                  </li>
                ))}
              </ul>
            )}
          </section>
        </div>
      </main>

      <Footer />
    </div>
  );
}
