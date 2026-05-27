"use client";

import { useState } from "react";
import { ArrowLeft, ArrowRight, RotateCcw, Shuffle } from "lucide-react";
import type { Flashcard } from "@/types";

// Vibrant rotating palette — different gradient per card.
// Front and back share the palette so flipping doesn't feel jarring.
const PALETTES = [
  {
    name: "indigo",
    front: "from-indigo-500 via-violet-500 to-fuchsia-500",
    back: "from-fuchsia-500 via-pink-500 to-rose-500",
    ring: "ring-indigo-300/40",
  },
  {
    name: "emerald",
    front: "from-emerald-500 via-teal-500 to-cyan-500",
    back: "from-cyan-500 via-sky-500 to-blue-500",
    ring: "ring-emerald-300/40",
  },
  {
    name: "amber",
    front: "from-amber-400 via-orange-500 to-rose-500",
    back: "from-rose-500 via-red-500 to-amber-500",
    ring: "ring-amber-300/40",
  },
  {
    name: "pink",
    front: "from-pink-500 via-fuchsia-500 to-purple-600",
    back: "from-purple-600 via-indigo-500 to-blue-500",
    ring: "ring-pink-300/40",
  },
  {
    name: "lime",
    front: "from-lime-400 via-green-500 to-emerald-600",
    back: "from-emerald-600 via-teal-500 to-cyan-500",
    ring: "ring-lime-300/40",
  },
  {
    name: "sky",
    front: "from-sky-400 via-blue-500 to-indigo-600",
    back: "from-indigo-600 via-violet-500 to-purple-500",
    ring: "ring-sky-300/40",
  },
];

export function FlashcardDeck({ cards }: { cards: Flashcard[] }) {
  const [index, setIndex] = useState(0);
  const [flipped, setFlipped] = useState(false);
  const [order, setOrder] = useState<number[]>(() =>
    cards.map((_, i) => i)
  );

  if (!cards.length) {
    return (
      <p className="text-sm text-muted-foreground">No flashcards generated.</p>
    );
  }

  const realIdx = order[index] ?? 0;
  const card = cards[realIdx];
  const palette = PALETTES[realIdx % PALETTES.length];

  const next = () => {
    setFlipped(false);
    setIndex((i) => (i + 1) % cards.length);
  };
  const prev = () => {
    setFlipped(false);
    setIndex((i) => (i - 1 + cards.length) % cards.length);
  };
  const shuffle = () => {
    const arr = [...order];
    for (let i = arr.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [arr[i], arr[j]] = [arr[j], arr[i]];
    }
    setOrder(arr);
    setIndex(0);
    setFlipped(false);
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h2 className="text-xl font-semibold">Flashcards</h2>
        <span className="text-sm text-muted-foreground">
          {index + 1} / {cards.length}
        </span>
      </div>

      {/* 3D flip card */}
      <div
        className="mx-auto w-full max-w-2xl"
        style={{ perspective: "1200px" }}
      >
        <button
          type="button"
          onClick={() => setFlipped((f) => !f)}
          aria-label={flipped ? "Show question" : "Show answer"}
          className={`group relative block h-72 w-full cursor-pointer rounded-2xl outline-none ring-offset-2 focus-visible:ring-4 ${palette.ring}`}
        >
          <div
            className="relative h-full w-full transition-transform duration-500"
            style={{
              transformStyle: "preserve-3d",
              transform: flipped ? "rotateY(180deg)" : "rotateY(0deg)",
            }}
          >
            {/* Front */}
            <div
              className={`absolute inset-0 flex items-center justify-center rounded-2xl bg-gradient-to-br ${palette.front} p-8 text-center text-white shadow-xl`}
              style={{ backfaceVisibility: "hidden" }}
            >
              <div className="relative w-full">
                <span className="absolute -top-2 left-0 rounded-full bg-white/20 px-2.5 py-0.5 text-[10px] font-semibold uppercase tracking-wider text-white/90 backdrop-blur">
                  Question
                </span>
                <p className="text-xl sm:text-2xl font-semibold leading-snug drop-shadow-sm">
                  {card.front}
                </p>
                <span className="absolute -bottom-3 right-0 text-[11px] text-white/80">
                  click to flip
                </span>
              </div>
            </div>

            {/* Back */}
            <div
              className={`absolute inset-0 flex items-center justify-center rounded-2xl bg-gradient-to-br ${palette.back} p-8 text-center text-white shadow-xl`}
              style={{
                backfaceVisibility: "hidden",
                transform: "rotateY(180deg)",
              }}
            >
              <div className="relative w-full">
                <span className="absolute -top-2 left-0 rounded-full bg-white/20 px-2.5 py-0.5 text-[10px] font-semibold uppercase tracking-wider text-white/90 backdrop-blur">
                  Answer
                </span>
                <p className="text-lg sm:text-xl font-medium leading-relaxed drop-shadow-sm">
                  {card.back}
                </p>
                <span className="absolute -bottom-3 right-0 text-[11px] text-white/80">
                  click to flip
                </span>
              </div>
            </div>
          </div>
        </button>
      </div>

      {/* Controls */}
      <div className="flex flex-wrap items-center justify-center gap-2">
        <button onClick={prev} className="btn-outline">
          <ArrowLeft className="h-4 w-4" /> Prev
        </button>
        <button onClick={() => setFlipped((f) => !f)} className="btn-ghost">
          <RotateCcw className="h-4 w-4" /> Flip
        </button>
        <button onClick={next} className="btn-outline">
          Next <ArrowRight className="h-4 w-4" />
        </button>
        <button onClick={shuffle} className="btn-ghost">
          <Shuffle className="h-4 w-4" /> Shuffle
        </button>
      </div>

      {/* Progress dots */}
      <div className="mt-2 flex flex-wrap items-center justify-center gap-1.5">
        {cards.map((_, i) => {
          const p = PALETTES[(order[i] ?? i) % PALETTES.length];
          const active = i === index;
          return (
            <button
              key={i}
              onClick={() => {
                setIndex(i);
                setFlipped(false);
              }}
              aria-label={`Go to card ${i + 1}`}
              className={`h-2 rounded-full transition-all bg-gradient-to-r ${p.front} ${
                active ? "w-6 opacity-100" : "w-2 opacity-50 hover:opacity-80"
              }`}
            />
          );
        })}
      </div>
    </div>
  );
}
