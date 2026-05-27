"use client";

import { useState } from "react";
import { toast } from "sonner";
import { Copy, Download, Plus } from "lucide-react";
import { useRouter } from "next/navigation";
import type { MCQ, Flashcard } from "@/types";
import { exportQuizPdf } from "@/lib/export";

type Props = {
  uploadId: string;
  summary: string;
  mcqs: MCQ[];
  flashcards: Flashcard[];
  filename: string;
};

export function QuizActions({
  uploadId,
  summary,
  mcqs,
  flashcards,
  filename,
}: Props) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);

  const onCopy = async () => {
    const text =
      `# Summary\n${summary}\n\n# MCQs\n` +
      mcqs
        .map(
          (m, i) =>
            `${i + 1}. ${m.question}\n` +
            m.options
              .map(
                (o, j) =>
                  `   ${String.fromCharCode(65 + j)}. ${o}${
                    j === m.answer_index ? "  ✓" : ""
                  }`
              )
              .join("\n")
        )
        .join("\n\n") +
      `\n\n# Flashcards\n` +
      flashcards.map((f, i) => `${i + 1}. ${f.front} — ${f.back}`).join("\n");

    try {
      await navigator.clipboard.writeText(text);
      toast.success("Copied to clipboard");
    } catch {
      toast.error("Copy failed");
    }
  };

  const onExport = () => {
    try {
      exportQuizPdf({ filename, summary, mcqs, flashcards });
      toast.success("PDF downloaded");
    } catch (err: any) {
      toast.error(err?.message ?? "Export failed");
    }
  };

  const onGenerateMore = async () => {
    setBusy(true);
    try {
      const res = await fetch("/api/generate-more", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ uploadId }),
      });

      const raw = await res.text();
      let data: any = {};
      try {
        data = raw ? JSON.parse(raw) : {};
      } catch {
        data = { error: raw.slice(0, 300) || `HTTP ${res.status}` };
      }
      if (!res.ok) {
        throw new Error(data?.error ?? `Failed (HTTP ${res.status})`);
      }
      toast.success(`Added ${data.added} new questions`);
      router.refresh();
    } catch (err: any) {
      toast.error(err?.message ?? "Failed");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="flex flex-wrap items-center gap-2">
      <button
        onClick={onGenerateMore}
        disabled={busy}
        className="btn-primary"
      >
        {busy ? (
          <span className="h-4 w-4 animate-spin rounded-full border-2 border-current border-t-transparent" />
        ) : (
          <Plus className="h-4 w-4" />
        )}
        Generate more questions
      </button>

      <button onClick={onCopy} className="btn-outline">
        <Copy className="h-4 w-4" /> Copy
      </button>

      <button onClick={onExport} className="btn-outline">
        <Download className="h-4 w-4" /> Export PDF
      </button>
    </div>
  );
}
