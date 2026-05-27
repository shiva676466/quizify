// Supabase Edge Function: process-quiz
// Runtime: Deno (Supabase Edge). Timeout: ~150s on free tier — plenty
// for three free-OpenRouter LLM calls that would blow up on Vercel Hobby.
//
// Deploy via Supabase Dashboard → Edge Functions → "Create a new function"
// or CLI:  supabase functions deploy process-quiz
//
// Required secrets (Dashboard → Edge Functions → Manage secrets):
//   OPENROUTER_API_KEY = sk-or-v1-...
//   SITE_URL           = https://quizify.vercel.app   (optional; used as Referer)
//
// SUPABASE_URL and SUPABASE_ANON_KEY are injected automatically.

// deno-lint-ignore-file no-explicit-any
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.4";

type SummaryMode = "general" | "exam";

const ENDPOINT = "https://openrouter.ai/api/v1/chat/completions";

// Free models on OpenRouter — try in order on 429/5xx.
const MODELS = [
  "openai/gpt-oss-120b:free",
  "deepseek/deepseek-v4-flash:free",
  "qwen/qwen3-next-80b-a3b-instruct:free",
  "meta-llama/llama-3.3-70b-instruct:free",
  "z-ai/glm-4.5-air:free",
  "openai/gpt-oss-20b:free",
];

const SUMMARY_SPEC: Record<SummaryMode, string> = {
  general:
    `A clear summary in 200-300 words. Plain paragraphs, no bullet lists, no markdown.`,
  exam:
    `A tight exam-focused study sheet, 250-350 words total. Use this exact layout:

KEY CONCEPTS
- 4-6 bullets. Each starts with the term in **bold** followed by a one-line definition.

DEFINITIONS & FORMULAS
- Bullet every important term, formula, equation, date, or name. Format: **Term** — definition.

LIKELY EXAM QUESTIONS
- 4 bullet points predicting questions a teacher would ask.

ASCII bullets ("- ") only. Bold with **double asterisks**. No prose intros.`,
};

const PER_ATTEMPT_MS = 45_000; // per-model timeout; the function itself has ~150s total.

function trim(text: string, max = 9000) {
  return text.length > max ? text.slice(0, max) : text;
}

function stripJsonFences(s: string) {
  return s.replace(/^```(?:json)?\s*/i, "").replace(/```\s*$/i, "").trim();
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

async function chat(prompt: string, temperature = 0.4): Promise<string> {
  const key = Deno.env.get("OPENROUTER_API_KEY");
  if (!key) throw new Error("OPENROUTER_API_KEY not set");
  const referer = Deno.env.get("SITE_URL") ?? "http://localhost:3000";
  const errors: string[] = [];

  for (const model of MODELS) {
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), PER_ATTEMPT_MS);
    try {
      const res = await fetch(ENDPOINT, {
        method: "POST",
        signal: ctrl.signal,
        headers: {
          "Content-Type": "application/json",
          "Authorization": `Bearer ${key}`,
          "HTTP-Referer": referer,
          "X-Title": "Quizify",
        },
        body: JSON.stringify({
          model,
          temperature,
          messages: [
            {
              role: "system",
              content:
                "You are an expert study assistant. Respond with STRICT JSON only — no prose, no markdown fences.",
            },
            { role: "user", content: prompt },
          ],
        }),
      });

      if (res.ok) {
        const data = await res.json();
        const content = data?.choices?.[0]?.message?.content ?? "";
        if (content) return content;
        errors.push(`${model}: empty`);
        continue;
      }

      const body = await res.text().catch(() => "");
      errors.push(`${model}: ${res.status} ${body.slice(0, 100)}`);
      if (res.status !== 429 && res.status < 500) break;
    } catch (err) {
      const e = err as Error;
      errors.push(
        `${model}: ${e.name === "AbortError" ? "timeout" : e.message}`,
      );
    } finally {
      clearTimeout(timer);
    }
  }

  throw new Error(`OpenRouter all models failed: ${errors.join(" | ")}`);
}

async function generateSummary(text: string, mode: SummaryMode): Promise<string> {
  const prompt = `Produce a summary of the study notes below.

Style: ${SUMMARY_SPEC[mode]}

Return STRICT JSON of the form: { "summary": "string" }
Return ONLY the JSON object.

NOTES:
"""
${trim(text)}
"""`;
  const raw = await chat(prompt, 0.3);
  const parsed = tryParseJson<{ summary?: string }>(raw);
  return (parsed?.summary ?? "").toString().trim();
}

async function generateMcqs(text: string): Promise<any[]> {
  const prompt = `From the study notes below, write exactly 10 multiple-choice questions covering the most important concepts.

Return STRICT JSON: { "mcqs": [...] } where each item is:
{ "question": string, "options": [s,s,s,s], "answer_index": 0..3, "explanation": string }

Rules:
- Each question has exactly 4 options.
- answer_index is 0..3.
- Do not repeat or paraphrase questions.
- Return ONLY the JSON object.

NOTES:
"""
${trim(text)}
"""`;
  const raw = await chat(prompt, 0.5);
  const parsed = tryParseJson<{ mcqs?: any[] } | any[]>(raw);
  const arr = Array.isArray(parsed) ? parsed : (parsed?.mcqs ?? []);
  return sanitizeMcqs(arr);
}

async function generateFlashcards(text: string): Promise<any[]> {
  const prompt = `From the study notes below, write 12 concise flashcards.
Front = a term or short question. Back = the definition or short answer.

Return STRICT JSON: { "flashcards": [...] } where each item is:
{ "front": string, "back": string }

Return ONLY the JSON object.

NOTES:
"""
${trim(text)}
"""`;
  const raw = await chat(prompt, 0.4);
  const parsed = tryParseJson<{ flashcards?: any[] } | any[]>(raw);
  const arr = Array.isArray(parsed) ? parsed : (parsed?.flashcards ?? []);
  return sanitizeFlashcards(arr);
}

function sanitizeMcqs(arr: any[]): any[] {
  if (!Array.isArray(arr)) return [];
  return arr.map((m: any) => {
    const options = Array.isArray(m?.options)
      ? m.options.slice(0, 4).map(String)
      : [];
    while (options.length < 4) options.push("");
    const idx = Number(m?.answer_index);
    return {
      question: String(m?.question ?? "").trim(),
      options,
      answer_index: Number.isInteger(idx) && idx >= 0 && idx < 4 ? idx : 0,
      explanation: m?.explanation ? String(m.explanation) : "",
    };
  }).filter((m: any) => m.question.length > 0);
}

function sanitizeFlashcards(arr: any[]): any[] {
  if (!Array.isArray(arr)) return [];
  return arr
    .map((c: any) => ({
      front: String(c?.front ?? "").trim(),
      back: String(c?.back ?? "").trim(),
    }))
    .filter((c: any) => c.front && c.back);
}

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

function json(status: number, body: unknown) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }
  if (req.method !== "POST") {
    return json(405, { error: "Method not allowed" });
  }

  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) return json(401, { error: "Missing Authorization header" });

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_ANON_KEY")!,
      { global: { headers: { Authorization: authHeader } } },
    );

    const { uploadId } = (await req.json().catch(() => ({}))) as {
      uploadId?: string;
    };
    if (!uploadId) return json(400, { error: "uploadId required" });

    // RLS limits this to the user's own row.
    const { data: upload, error: uErr } = await supabase
      .from("uploads")
      .select("id, user_id, notes_text")
      .eq("id", uploadId)
      .single();
    if (uErr || !upload?.notes_text) {
      return json(404, {
        error: uErr?.message ?? "Upload or notes_text not found",
      });
    }

    const { data: quiz, error: qErr } = await supabase
      .from("quizzes")
      .select("id, summary_mode")
      .eq("upload_id", uploadId)
      .single();
    if (qErr || !quiz) {
      return json(404, { error: qErr?.message ?? "Quiz row not found" });
    }

    const mode: SummaryMode = quiz.summary_mode === "exam" ? "exam" : "general";

    // 1. Summary
    const summary = await generateSummary(upload.notes_text, mode);
    if (!summary) throw new Error("AI returned empty summary");

    // 2. MCQs
    const mcqs = await generateMcqs(upload.notes_text);
    if (!mcqs.length) throw new Error("AI returned no MCQs");

    // 3. Flashcards
    const cards = await generateFlashcards(upload.notes_text);

    // Persist
    {
      const { error } = await supabase
        .from("quizzes")
        .update({ summary, mcqs })
        .eq("id", quiz.id);
      if (error) throw new Error(`Save quiz failed: ${error.message}`);
    }

    if (cards.length) {
      const rows = cards.map((f: any) => ({
        upload_id: upload.id,
        user_id: upload.user_id,
        front: f.front,
        back: f.back,
      }));
      const { error } = await supabase.from("flashcards").insert(rows);
      if (error) throw new Error(`Save flashcards failed: ${error.message}`);
    }

    await supabase
      .from("uploads")
      .update({ status: "ready" })
      .eq("id", upload.id);

    return json(200, {
      ok: true,
      summary_length: summary.length,
      mcqs: mcqs.length,
      flashcards: cards.length,
    });
  } catch (err) {
    const e = err as Error;
    return json(500, { error: e.message ?? "Unexpected error" });
  }
});
