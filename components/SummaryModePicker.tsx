"use client";

import { BookOpen, GraduationCap } from "lucide-react";
import { cn } from "@/lib/utils";
import type { SummaryMode } from "@/types";

type Props = {
  value: SummaryMode;
  onChange: (m: SummaryMode) => void;
  disabled?: boolean;
};

const OPTIONS: {
  id: SummaryMode;
  label: string;
  desc: string;
  icon: any;
}[] = [
  {
    id: "general",
    label: "General",
    desc: "Smooth paragraph summary that reads like a study guide.",
    icon: BookOpen,
  },
  {
    id: "exam",
    label: "Exam focus",
    desc: "Cheat-sheet style: definitions, formulas, likely exam questions.",
    icon: GraduationCap,
  },
];

export function SummaryModePicker({ value, onChange, disabled }: Props) {
  return (
    <fieldset disabled={disabled} className="w-full">
      <legend className="text-sm font-medium mb-2">Summary style</legend>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
        {OPTIONS.map((opt) => {
          const active = value === opt.id;
          const Icon = opt.icon;
          return (
            <button
              key={opt.id}
              type="button"
              onClick={() => onChange(opt.id)}
              className={cn(
                "flex items-start gap-3 rounded-xl border p-3 text-left transition",
                active
                  ? "border-primary bg-primary/5 ring-2 ring-primary/30"
                  : "border-border bg-card hover:bg-muted/40",
                disabled && "opacity-60 cursor-not-allowed"
              )}
              aria-pressed={active}
            >
              <span
                className={cn(
                  "mt-0.5 inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-lg",
                  active
                    ? "bg-primary text-primary-foreground"
                    : "bg-muted text-muted-foreground"
                )}
              >
                <Icon className="h-4 w-4" />
              </span>
              <span className="flex flex-col">
                <span className="text-sm font-semibold">{opt.label}</span>
                <span className="text-xs text-muted-foreground">{opt.desc}</span>
              </span>
            </button>
          );
        })}
      </div>
    </fieldset>
  );
}
