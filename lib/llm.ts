// LLM provider: OpenRouter (OpenAI-compatible Chat Completions API).
// Free tier, no billing required. Get a key at https://openrouter.ai/keys
import type { Flashcard, GenerateResult, MCQ } from "@/types";

// Free models on OpenRouter — we try them in order on 429 / 5xx so a single
// upstream provider being rate-limited doesn't kill the request.
// Override the primary via env (OPENROUTER_MODEL); the rest are fallbacks.
// See https://openrouter.ai/models?max_price=0 for the current free list.
const MODELS: string[] = [
  process.env.OPENROUTER_MODEL ?? "openai/gpt-oss-120b:free",
  "deepseek/deepseek-v4-flash:free",
  "qwen/qwen3-next-80b-a3b-instruct:free",
  "meta-llama/llama-3.3-70b-instruct:free",
  "z-ai/glm-4.5-air:free",
  "openai/gpt-oss-20b:free",
].filter((m, i, arr) => arr.indexOf(m) === i); // de-dupe in case env collides

const ENDPOINT = "https://openrouter.ai/api/v1/chat/completions";

function getKey() {
  const k = process.env.OPENROUTER_API_KEY;
  if (!k) throw new Error("OPENROUTER_API_KEY is not configured");
  return k;
}

function trim(text: string, max = 14_000) {
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
  try {
    return JSON.parse(cleaned) as T;
  } catch {
    const first = cleaned.search(/[\[{]/);
    const last = Math.max(cleaned.lastIndexOf("}"), cleaned.lastIndexOf("]"));
    if (first >= 0 && last > first) {
      return JSON.parse(cleaned.slice(first, last + 1)) as T;
    }
    throw new Error("Failed to parse LLM JSON output");
  }
}

async function chat(prompt: string, opts?: { temperature?: number }): Promise<string> {
  const referer =
    process.env.NEXT_PUBLIC_SITE_URL ?? "http://localhost:3000";
  const key = getKey();

  const lastErrors: string[] = [];

  for (const model of MODELS) {
    try {
      const res = await fetch(ENDPOINT, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${key}`,
          "HTTP-Referer": referer,
          "X-Title": "Quizify",
        },
        body: JSON.stringify({
          model,
          temperature: opts?.temperature ?? 0.4,
          messages: [
            {
              role: "system",
              content:
                "You are an expert study assistant. Respond with STRICT JSON only — no prose, no markdown fences, no explanation outside the JSON.",
            },
            { role: "user", content: prompt },
          ],
        }),
      });

      if (res.ok) {
        const data = (await res.json()) as {
          choices?: Array<{ message?: { content?: string } }>;
        };
        const content = data.choices?.[0]?.message?.content ?? "";
        if (content) return content;
        lastErrors.push(`${model}: empty response`);
        continue;
      }

      const body = await res.text().catch(() => "");
      lastErrors.push(`${model}: ${res.status} ${body.slice(0, 160)}`);

      // Only retry on transient/upstream errors. 401/403/4xx-auth = stop early.
      const retryable = res.status === 429 || res.status >= 500;
      if (!retryable) break;
    } catch (err: any) {
      lastErrors.push(`${model}: ${err?.message ?? err}`);
    }
  }

  throw new Error(`OpenRouter: all models failed. ${lastErrors.join(" | ")}`);
}

export async function generateFromNotes(text: string): Promise<GenerateResult> {
  const prompt = `Given the user's study notes below, produce a JSON object containing:
1. "summary": a clear, well-structured 250-400 word summary (plain text, paragraphs).
2. "mcqs": exactly 10 multiple-choice questions covering the most important concepts.
3. "flashcards": 12 concise flashcards (front = term/question, back = definition/answer).

Return STRICT JSON with this exact shape — no prose, no markdown fences:
{
  "summary": "string",
  "mcqs": [
    { "question": "string", "options": ["s","s","s","s"], "answer_index": 0, "explanation": "string" }
  ],
  "flashcards": [
    { "front": "string", "back": "string" }
  ]
}

Rules:
- Each MCQ must have exactly 4 options.
- answer_index is an integer 0..3.
- Do not repeat questions.
- Keep options plausible but unambiguous.
- Return ONLY the JSON object. No prose before or after.

NOTES:
"""
${trim(text)}
"""`;

  const raw = await chat(prompt);
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
  const prompt = `Generate 10 NEW multiple-choice questions from the notes below.
Do NOT repeat or paraphrase any of these existing questions:
${existingQuestions.map((q, i) => `${i + 1}. ${q}`).join("\n")}

Return STRICT JSON — an object with a single "mcqs" array:
{
  "mcqs": [
    { "question": "string", "options": ["s","s","s","s"], "answer_index": 0, "explanation": "string" }
  ]
}

Return ONLY the JSON object. No prose.

NOTES:
"""
${trim(text)}
"""`;

  const raw = await chat(prompt, { temperature: 0.7 });
  const parsed = tryParseJson<{ mcqs?: MCQ[] } | MCQ[]>(raw);
  const arr = Array.isArray(parsed) ? parsed : (parsed?.mcqs ?? []);
  return sanitizeMcqs(arr);
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
