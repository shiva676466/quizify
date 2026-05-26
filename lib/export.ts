"use client";

import jsPDF from "jspdf";
import type { Flashcard, MCQ } from "@/types";

type Args = {
  filename: string;
  summary: string;
  mcqs: MCQ[];
  flashcards: Flashcard[];
};

export function exportQuizPdf({ filename, summary, mcqs, flashcards }: Args) {
  const doc = new jsPDF({ unit: "pt", format: "a4" });
  const margin = 48;
  const pageWidth = doc.internal.pageSize.getWidth();
  const pageHeight = doc.internal.pageSize.getHeight();
  const maxWidth = pageWidth - margin * 2;
  let y = margin;

  const ensureSpace = (needed: number) => {
    if (y + needed > pageHeight - margin) {
      doc.addPage();
      y = margin;
    }
  };

  const writeWrapped = (text: string, size: number, bold = false) => {
    doc.setFontSize(size);
    doc.setFont("helvetica", bold ? "bold" : "normal");
    const lines = doc.splitTextToSize(text, maxWidth);
    for (const line of lines) {
      ensureSpace(size + 4);
      doc.text(line, margin, y);
      y += size + 4;
    }
  };

  // Title
  writeWrapped(`Quizify — ${filename}`, 18, true);
  y += 8;
  writeWrapped(new Date().toLocaleString(), 10);
  y += 12;

  writeWrapped("Summary", 14, true);
  y += 4;
  writeWrapped(summary || "(no summary)", 11);
  y += 12;

  writeWrapped("Multiple Choice Questions", 14, true);
  y += 4;
  mcqs.forEach((m, i) => {
    writeWrapped(`${i + 1}. ${m.question}`, 11, true);
    m.options.forEach((opt, j) => {
      const marker = j === m.answer_index ? " (correct)" : "";
      writeWrapped(`   ${String.fromCharCode(65 + j)}. ${opt}${marker}`, 11);
    });
    if (m.explanation) writeWrapped(`   Why: ${m.explanation}`, 10);
    y += 6;
  });

  y += 6;
  writeWrapped("Flashcards", 14, true);
  y += 4;
  flashcards.forEach((f, i) => {
    writeWrapped(`${i + 1}. ${f.front}`, 11, true);
    writeWrapped(`   ${f.back}`, 11);
    y += 4;
  });

  const safe = filename.replace(/\.pdf$/i, "").replace(/[^\w-]+/g, "_");
  doc.save(`quizify-${safe}.pdf`);
}
