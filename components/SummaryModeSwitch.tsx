"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { BookOpen, GraduationCap, Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";
import type { SummaryMode } from "@/types";

type Props = {
  uploadId: string;
  current: SummaryMode;
};

const OPTIONS: { id: SummaryMode; label: string; icon: any }[] = [
  { id: "general", label: "General", icon: BookOpen },
  { id: "exam", label: "Exam focus", icon: GraduationCap },
];

export function SummaryModeSwitch({ uploadId, current }: Props) {
  const router = useRouter();
  const [busy, setBusy] = useState<SummaryMode | null>(null);

  const onPick = async (mode: SummaryMode) => {
    if (mode === current || busy) return;
    setBusy(mode);
    try {
      const res = await fetch("/api/regenerate-summary", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ uploadId, mode }),
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
      toast.success(
        mode === "exam" ? "Exam summary ready" : "General summary ready"
      );
      router.refresh();
    } catch (err: any) {
      toast.error(err?.message ?? "Failed to regenerate");
    } finally {
      setBusy(null);
    }
  };

  return (
    <div
      role="tablist"
      aria-label="Summary style"
      className="inline-flex items-center rounded-lg border border-border bg-card p-1"
    >
      {OPTIONS.map((o) => {
        const active = o.id === current;
        const Icon = o.icon;
        const loading = busy === o.id;
        return (
          <button
            key={o.id}
            role="tab"
            aria-selected={active}
            onClick={() => onPick(o.id)}
            disabled={!!busy}
            className={cn(
              "inline-flex items-center gap-1.5 rounded-md px-3 py-1.5 text-xs font-medium transition",
              active
                ? "bg-primary text-primary-foreground shadow-sm"
                : "text-muted-foreground hover:bg-muted hover:text-foreground",
              busy && !active && "opacity-50 cursor-not-allowed"
            )}
          >
            {loading ? (
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
            ) : (
              <Icon className="h-3.5 w-3.5" />
            )}
            {o.label}
          </button>
        );
      })}
    </div>
  );
}
