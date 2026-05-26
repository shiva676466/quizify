"use client";

import { useState } from "react";
import { ArrowLeft, ArrowRight, RotateCcw } from "lucide-react";
import type { Flashcard } from "@/types";

export function FlashcardDeck({ cards }: { cards: Flashcard[] }) {
  const [index, setIndex] = useState(0);
  const [flipped, setFlipped] = useState(false);

  if (!cards.length) {
    return (
      <p className="text-sm text-muted-foreground">No flashcards generated.</p>
    );
  }

  const card = cards[index];

  const next = () => {
    setFlipped(false);
    setIndex((i) => (i + 1) % cards.length);
  };
  const prev = () => {
    setFlipped(false);
    setIndex((i) => (i - 1 + cards.length) % cards.length);
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h2 className="text-xl font-semibold">Flashcards</h2>
        <span className="text-sm text-muted-foreground">
          {index + 1} / {cards.length}
        </span>
      </div>

      <div
        onClick={() => setFlipped((f) => !f)}
        className="group relative mx-auto flex h-64 w-full max-w-2xl cursor-pointer items-center justify-center rounded-2xl border border-border bg-gradient-to-br from-card to-muted/40 p-8 text-center shadow-sm transition hover:shadow-md"
      >
        <p className="text-lg sm:text-xl font-medium leading-relaxed">
          {flipped ? card.back : card.front}
        </p>
        <span className="absolute bottom-3 right-4 text-xs text-muted-foreground">
          {flipped ? "Answer" : "Question"} • click to flip
        </span>
      </div>

      <div className="flex items-center justify-center gap-2">
        <button onClick={prev} className="btn-outline">
          <ArrowLeft className="h-4 w-4" /> Prev
        </button>
        <button onClick={() => setFlipped((f) => !f)} className="btn-ghost">
          <RotateCcw className="h-4 w-4" /> Flip
        </button>
        <button onClick={next} className="btn-outline">
          Next <ArrowRight className="h-4 w-4" />
        </button>
      </div>
    </div>
  );
}
