import { GoogleGenerativeAI } from "@google/generative-ai";
import type { GenerateResult, MCQ, Flashcard } from "@/types";

const MODEL = "gemini-1.5-flash";

function getClient() {
  const key = process.env.GEMINI_API_KEY;
  if (!key) throw new Error("GEMINI_API_KEY is not configured");
  return new GoogleGenerativeAI(key);
}

// Trim text to keep prompt size reasonable.
function trim(text: string, max = 24_000) {
  return text.length > max ? text.slice(0, max) : text;
}

function stripJsonFences(s: string) {
  return s
    .replace(/^```(?:json)?\s*/i, "")
    .replace(/```\s*$/i, "")
    .trim();
}

function tryParseJson<T>(raw: string): T {
  const cleaned = stripJsonFences(raw);
  // Try direct first
  try {
    return JSON.parse(cleaned) as T;
  } catch {
    // Fallback: find the largest {...} or [...] block
    const first = cleaned.search(/[\[{]/);
    const last = Math.max(cleaned.lastIndexOf("}"), cleaned.lastIndexOf("]"));
    if (first >= 0 && last > first) {
      return JSON.parse(cleaned.slice(first, last + 1)) as T;
    }
    throw new Error("Failed to parse Gemini JSON output");
  }
}

export async function generateFromNotes(text: string): Promise<GenerateResult> {
  const genAI = getClient();
  const model = genAI.getGenerativeModel({
    model: MODEL,
    generationConfig: {
      temperature: 0.4,
      responseMimeType: "application/json",
    },
  });

  const prompt = `You are an expert study assistant. Given the user's study notes below, produce:
1. A clear, well-structured summary (250-400 words, markdown allowed).
2. Exactly 10 multiple-choice questions covering the most important concepts.
3. 12 concise flashcards (front = term/question, back = definition/answer).

Return STRICT JSON with this exact shape — no prose, no markdown fences:
{
  "summary": "string",
  "mcqs": [
    {
      "question": "string",
      "options": ["string", "string", "string", "string"],
      "answer_index": 0,
      "explanation": "string"
    }
  ],
  "flashcards": [
    { "front": "string", "back": "string" }
  ]
}

Rules:
- Each MCQ must have exactly 4 options.
- answer_index is 0..3.
- Do not repeat questions.
- Keep options plausible but unambiguous.

NOTES:
"""
${trim(text)}
"""`;

  const result = await model.generateContent(prompt);
  const raw = result.response.text();
  const parsed = tryParseJson<GenerateResult>(raw);

  return {
    summary: parsed.summary?.toString() ?? "",
    mcqs: sanitizeMcqs(parsed.mcqs ?? []),
    flashcards: sanitizeFlashcards(parsed.flashcards ?? []),
  };
}

export async function generateMoreMcqs(
  text: string,
  existingQuestions: string[]
): Promise<MCQ[]> {
  const genAI = getClient();
  const model = genAI.getGenerativeModel({
    model: MODEL,
    generationConfig: {
      temperature: 0.7,
      responseMimeType: "application/json",
    },
  });

  const prompt = `Generate 10 NEW multiple-choice questions from the notes below.
Do NOT repeat or paraphrase any of these existing questions:
${existingQuestions.map((q, i) => `${i + 1}. ${q}`).join("\n")}

Return STRICT JSON: an array of objects with shape:
{ "question": string, "options": [s,s,s,s], "answer_index": 0..3, "explanation": string }

NOTES:
"""
${trim(text)}
"""`;

  const result = await model.generateContent(prompt);
  const raw = result.response.text();
  const parsed = tryParseJson<MCQ[]>(raw);
  return sanitizeMcqs(parsed);
}

function sanitizeMcqs(mcqs: unknown[]): MCQ[] {
  if (!Array.isArray(mcqs)) return [];
  return mcqs
    .map((m: any) => {
      const options = Array.isArray(m?.options) ? m.options.slice(0, 4).map(String) : [];
      while (options.length < 4) options.push("");
      const idx = Number(m?.answer_index);
      return {
        question: String(m?.question ?? "").trim(),
        options,
        answer_index: Number.isInteger(idx) && idx >= 0 && idx < 4 ? idx : 0,
        explanation: m?.explanation ? String(m.explanation) : "",
      } as MCQ;
    })
    .filter((m) => m.question.length > 0);
}

function sanitizeFlashcards(cards: unknown[]): Flashcard[] {
  if (!Array.isArray(cards)) return [];
  return cards
    .map((c: any) => ({
      front: String(c?.front ?? "").trim(),
      back: String(c?.back ?? "").trim(),
    }))
    .filter((c) => c.front && c.back);
}
