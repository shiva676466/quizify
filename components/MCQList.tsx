"use client";

import { useState } from "react";
import { Check, X } from "lucide-react";
import type { MCQ } from "@/types";
import { cn } from "@/lib/utils";

export function MCQList({ mcqs }: { mcqs: MCQ[] }) {
  const [picks, setPicks] = useState<Record<number, number>>({});
  const [revealed, setRevealed] = useState<Record<number, boolean>>({});

  const score = Object.entries(revealed).reduce((acc, [k, v]) => {
    const i = Number(k);
    if (!v) return acc;
    return acc + (picks[i] === mcqs[i].answer_index ? 1 : 0);
  }, 0);

  const answered = Object.values(revealed).filter(Boolean).length;

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h2 className="text-xl font-semibold">Multiple Choice Questions</h2>
        <div className="text-sm text-muted-foreground">
          Score: <span className="font-medium text-foreground">{score}</span> / {answered || 0}
        </div>
      </div>

      <ol className="space-y-4">
        {mcqs.map((mcq, i) => {
          const picked = picks[i];
          const isRevealed = !!revealed[i];
          return (
            <li key={i} className="card p-5 animate-slide-up">
              <div className="flex items-start gap-3">
                <span className="mt-0.5 inline-flex h-6 w-6 shrink-0 items-center justify-center rounded-md bg-muted text-xs font-semibold">
                  {i + 1}
                </span>
                <p className="font-medium leading-snug">{mcq.question}</p>
              </div>

              <ul className="mt-4 grid gap-2">
                {mcq.options.map((opt, j) => {
                  const isPicked = picked === j;
                  const isCorrect = mcq.answer_index === j;
                  let style =
                    "border-border bg-card hover:bg-muted/60";
                  if (isRevealed) {
                    if (isCorrect)
                      style =
                        "border-emerald-500/40 bg-emerald-500/10 text-emerald-700 dark:text-emerald-300";
                    else if (isPicked)
                      style =
                        "border-red-500/40 bg-red-500/10 text-red-700 dark:text-red-300";
                    else style = "border-border bg-card opacity-70";
                  } else if (isPicked) {
                    style = "border-primary/50 bg-primary/5";
                  }
                  return (
                    <li key={j}>
                      <button
                        disabled={isRevealed}
                        onClick={() =>
                          setPicks((p) => ({ ...p, [i]: j }))
                        }
                        className={cn(
                          "w-full rounded-lg border px-3.5 py-2.5 text-left text-sm transition",
                          style
                        )}
                      >
                        <span className="mr-2 font-mono text-xs text-muted-foreground">
                          {String.fromCharCode(65 + j)}.
                        </span>
                        {opt}
                        {isRevealed && isCorrect && (
                          <Check className="ml-2 inline h-4 w-4 align-text-bottom" />
                        )}
                        {isRevealed && isPicked && !isCorrect && (
                          <X className="ml-2 inline h-4 w-4 align-text-bottom" />
                        )}
                      </button>
                    </li>
                  );
                })}
              </ul>

              <div className="mt-3 flex items-center justify-between">
                {isRevealed ? (
                  mcq.explanation ? (
                    <p className="text-sm text-muted-foreground">
                      <span className="font-medium text-foreground">Why: </span>
                      {mcq.explanation}
                    </p>
                  ) : (
                    <span />
                  )
                ) : (
                  <span className="text-xs text-muted-foreground">
                    Pick an answer, then reveal.
                  </span>
                )}
                <button
                  className="btn-outline"
                  disabled={picked === undefined || isRevealed}
                  onClick={() =>
                    setRevealed((r) => ({ ...r, [i]: true }))
                  }
                >
                  Reveal
                </button>
              </div>
            </li>
          );
        })}
      </ol>
    </div>
  );
}
