"use client";

import { useCallback, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { FileUp, Loader2 } from "lucide-react";
import { formatBytes } from "@/lib/utils";
import { createClient } from "@/lib/supabase/client";

// PDFs are uploaded straight to Supabase Storage from the browser, so this
// limit is no longer constrained by Vercel's serverless body cap.
const MAX_BYTES = 10 * 1024 * 1024; // 10 MB

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
      try {
        const supabase = createClient();
        const {
          data: { user },
        } = await supabase.auth.getUser();
        if (!user) {
          toast.error("Please sign in again.");
          return;
        }

        // 1. Upload PDF directly to Supabase Storage.
        setStage("Uploading PDF…");
        const objectId = crypto.randomUUID();
        const storagePath = `${user.id}/${objectId}.pdf`;
        const { error: storageErr } = await supabase.storage
          .from("pdfs")
          .upload(storagePath, file, {
            contentType: "application/pdf",
            upsert: false,
          });
        if (storageErr) {
          throw new Error(`Upload to storage failed: ${storageErr.message}`);
        }

        // 2. Tell the API to process it.
        setStage("Extracting text & generating quiz…");
        const res = await fetch("/api/upload", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            filename: file.name,
            size: file.size,
            storagePath,
          }),
        });

        const raw = await res.text();
        let data: any = {};
        try {
          data = raw ? JSON.parse(raw) : {};
        } catch {
          data = { error: raw.slice(0, 300) || `HTTP ${res.status}` };
        }

        if (!res.ok) {
          // Clean up the orphaned storage object so it doesn't linger.
          supabase.storage.from("pdfs").remove([storagePath]).catch(() => {});
          throw new Error(data?.error ?? `Processing failed (HTTP ${res.status})`);
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
