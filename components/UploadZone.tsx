"use client";

import { useCallback, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { FileUp, Loader2 } from "lucide-react";
import { formatBytes } from "@/lib/utils";
import { createClient } from "@/lib/supabase/client";
import { SummaryModePicker } from "./SummaryModePicker";
import type { SummaryMode } from "@/types";

// PDFs are uploaded straight to Supabase Storage so this limit isn't
// constrained by Vercel's serverless body cap.
const MAX_BYTES = 10 * 1024 * 1024; // 10 MB

// Parse a fetch response defensively — Vercel edge can return non-JSON
// (HTML error pages, plain text "Request Entity Too Large", etc.).
async function readJson(res: Response): Promise<{ ok: boolean; data: any; raw: string }> {
  const raw = await res.text();
  try {
    return { ok: res.ok, data: raw ? JSON.parse(raw) : {}, raw };
  } catch {
    return { ok: res.ok, data: { error: raw.slice(0, 300) || `HTTP ${res.status}` }, raw };
  }
}

async function post(path: string, body: Record<string, unknown>) {
  const res = await fetch(path, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  const { ok, data } = await readJson(res);
  if (!ok) throw new Error(data?.error ?? `${path} failed (HTTP ${res.status})`);
  return data;
}

export function UploadZone() {
  const router = useRouter();
  const inputRef = useRef<HTMLInputElement>(null);
  const [dragging, setDragging] = useState(false);
  const [busy, setBusy] = useState(false);
  const [stage, setStage] = useState<string>("");
  const [mode, setMode] = useState<SummaryMode>("general");

  const handleFiles = useCallback(
    async (files: FileList | null) => {
      if (!files || files.length === 0) return;
      const file = files[0];

      if (file.type !== "application/pdf") {
        toast.error("Only PDF files are supported.");
        return;
      }
      if (file.size > MAX_BYTES) {
        toast.error(
          `File is ${formatBytes(file.size)} — limit is ${formatBytes(MAX_BYTES)}.`
        );
        return;
      }

      setBusy(true);
      const supabase = createClient();
      const objectId = crypto.randomUUID();
      let storagePath = "";

      try {
        const {
          data: { user },
        } = await supabase.auth.getUser();
        if (!user) {
          toast.error("Please sign in again.");
          return;
        }

        // 1) Upload PDF straight to Supabase Storage.
        setStage("Uploading PDF…");
        storagePath = `${user.id}/${objectId}.pdf`;
        const { error: storageErr } = await supabase.storage
          .from("pdfs")
          .upload(storagePath, file, {
            contentType: "application/pdf",
            upsert: false,
          });
        if (storageErr) {
          throw new Error(`Upload to storage failed: ${storageErr.message}`);
        }

        // 2) /api/upload — extract text, return uploadId. (No LLM.)
        setStage("Extracting text…");
        const { uploadId } = await post("/api/upload", {
          filename: file.name,
          size: file.size,
          storagePath,
          summaryMode: mode,
        });

        // 3) Supabase Edge Function — full LLM pipeline in one ~60s call.
        // Runs on Supabase (Deno, ~150s timeout) instead of Vercel Hobby
        // so big free-tier LLM calls don't blow the function deadline.
        setStage(
          mode === "exam"
            ? "Building exam study sheet, MCQs & flashcards…"
            : "Generating summary, MCQs & flashcards…"
        );
        const { data: edgeData, error: edgeErr } =
          await supabase.functions.invoke("process-quiz", {
            body: { uploadId },
          });
        if (edgeErr) {
          // The body of an Edge error is on .context; surface what we can.
          const ctx = (edgeErr as any).context;
          const errBody = ctx ? await ctx.text?.().catch(() => "") : "";
          throw new Error(
            edgeErr.message + (errBody ? `: ${errBody.slice(0, 200)}` : "")
          );
        }
        if (edgeData?.error) throw new Error(edgeData.error);

        toast.success("Quiz ready!");
        router.push(`/quiz/${uploadId}`);
        router.refresh();
      } catch (err: any) {
        // Best-effort: orphaned storage object cleanup if the chain failed
        // before we even created an upload row.
        if (storagePath) {
          supabase.storage.from("pdfs").remove([storagePath]).catch(() => {});
        }
        toast.error(err?.message ?? "Upload failed");
      } finally {
        setBusy(false);
        setStage("");
      }
    },
    [router, mode]
  );

  return (
    <div className="space-y-4">
      <SummaryModePicker value={mode} onChange={setMode} disabled={busy} />

      <div
        onDragOver={(e) => {
          e.preventDefault();
          setDragging(true);
        }}
        onDragLeave={() => setDragging(false)}
        onDrop={(e) => {
          e.preventDefault();
          setDragging(false);
          if (!busy) handleFiles(e.dataTransfer.files);
        }}
        onClick={() => !busy && inputRef.current?.click()}
        className={[
          "relative cursor-pointer rounded-2xl border-2 border-dashed p-10 text-center transition",
          dragging
            ? "border-primary bg-primary/5"
            : "border-border bg-card hover:bg-muted/40",
          busy && "pointer-events-none opacity-90",
        ].join(" ")}
      >
        <input
          ref={inputRef}
          type="file"
          accept="application/pdf"
          className="hidden"
          onChange={(e) => handleFiles(e.target.files)}
        />

        <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-xl bg-primary/10 text-primary">
          {busy ? (
            <Loader2 className="h-6 w-6 animate-spin" />
          ) : (
            <FileUp className="h-6 w-6" />
          )}
        </div>

        <h3 className="mt-4 text-lg font-semibold">
          {busy ? stage || "Working…" : "Upload your PDF notes"}
        </h3>
        <p className="mt-1 text-sm text-muted-foreground">
          {busy
            ? "This usually takes 30–60 seconds across four steps."
            : `Drag & drop or click to choose a file. Max ${formatBytes(MAX_BYTES)}.`}
        </p>

        {!busy && (
          <p className="mt-4 text-xs text-muted-foreground">
            Supported: PDF • Limit: {formatBytes(MAX_BYTES)} • Style:{" "}
            <span className="font-medium text-foreground">
              {mode === "exam" ? "Exam focus" : "General"}
            </span>
          </p>
        )}
      </div>
    </div>
  );
}
