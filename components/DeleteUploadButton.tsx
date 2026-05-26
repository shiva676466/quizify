"use client";

import { Trash2 } from "lucide-react";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";

export function DeleteUploadButton({ uploadId }: { uploadId: string }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);

  const onClick = async () => {
    if (!confirm("Delete this upload and its quiz? This cannot be undone.")) return;
    setBusy(true);
    try {
      const res = await fetch("/api/delete-upload", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ uploadId }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data?.error ?? "Delete failed");
      toast.success("Deleted");
      router.refresh();
    } catch (err: any) {
      toast.error(err?.message ?? "Delete failed");
    } finally {
      setBusy(false);
    }
  };

  return (
    <button
      onClick={onClick}
      disabled={busy}
      className="rounded-md p-2 text-muted-foreground hover:bg-red-500/10 hover:text-red-500 transition disabled:opacity-50"
      aria-label="Delete upload"
      title="Delete"
    >
      <Trash2 className="h-4 w-4" />
    </button>
  );
}
