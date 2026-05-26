// Server-only PDF text extraction
import "server-only";

export async function extractPdfText(buffer: Buffer): Promise<string> {
  // pdf-parse has a debug branch that runs at import time when require.main is set.
  // Importing the inner module avoids that.
  const pdfParse = (await import("pdf-parse/lib/pdf-parse.js")).default as (
    data: Buffer
  ) => Promise<{ text: string }>;

  const { text } = await pdfParse(buffer);
  // Collapse runs of whitespace and trim. Do NOT strip all spaces.
  return (text || "").replace(/\s+/g, " ").trim();
}
