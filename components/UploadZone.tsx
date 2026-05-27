"use client";

import { useCallback, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { FileUp, Loader2 } from "lucide-react";
import { formatBytes } from "@/lib/utils";

// Vercel Hobby caps serverless request bodies at 4.5 MB. We use 4 MB to give
// a small margin (multipart form overhead + cookies).
const MAX_BYTES = 4 * 1024 * 1024;

export function UploadZone() {
  const router = useRouter();
  const inputRef = useRef<HTMLInputElement>(null);
  const [dragging, setDragging] = useState(false);
  const [busy, setBusy] = useState(false);
  const [stage, setStage] = useState<string>("");

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
      setStage("Uploading…");
      const fd = new FormData();
      fd.append("file", file);

      try {
        setStage("Extracting text & generating quiz…");
        const res = await fetch("/api/upload", { method: "POST", body: fd });

        // The server may not return JSON (e.g. Vercel edge sends plain text
        // "Request Entity Too Large" before the function runs). Read as text
        // first and JSON-parse defensively so we never throw a confusing
        // "Unexpected token" error in the UI.
        const raw = await res.text();
        let data: any = {};
        try {
          data = raw ? JSON.parse(raw) : {};
        } catch {
          data = { error: raw.slice(0, 300) || `HTTP ${res.status}` };
        }

        if (!res.ok) {
          if (res.status === 413) {
            throw new Error(
              `File too large for the server (${formatBytes(file.size)}). Try a smaller PDF.`
            );
          }
          throw new Error(data?.error ?? `Upload failed (HTTP ${res.status})`);
        }

        toast.success("Quiz ready!");
        router.push(`/quiz/${data.uploadId}`);
        router.refresh();
      } catch (err: any) {
        toast.error(err?.message ?? "Upload failed");
      } finally {
        setBusy(false);
        setStage("");
      }
    },
    [router]
  );

  return (
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
          ? "This usually takes 10–30 seconds."
          : `Drag & drop or click to choose a file. Max ${formatBytes(MAX_BYTES)}.`}
      </p>

      {!busy && (
        <p className="mt-4 text-xs text-muted-foreground">
          Supported: PDF • Limit: {formatBytes(MAX_BYTES)}
        </p>
      )}
    </div>
  );
}
