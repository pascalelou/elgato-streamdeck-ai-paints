import type { ActionSettings, RandomDraft } from "../settings/types";

export const RANDOM_HISTORY_LIMIT = 12;
export const RANDOM_MAX_ATTEMPTS = 3;
export const MAX_RANDOM_PROMPT_LENGTH = 700;

export function normalizeRandomPrompt(value: unknown): string {
  if (typeof value !== "string") return "";
  const prompt = value.trim().replace(/^```(?:text)?\s*/i, "").replace(/\s*```$/, "")
    .replace(/^(?:prompt|final prompt)\s*:\s*/i, "").replace(/^(["'])|(["'])$/g, "")
    .replace(/\s+/g, " ").trim();
  if (prompt.length > MAX_RANDOM_PROMPT_LENGTH || prompt.split(/\s+/).length < 4
    || /[{}[\]<>]|```|\b(?:as an ai|i cannot|i can't|sorry|here (?:is|are)|unable to)\b/i.test(prompt)
    || /(?:^|\s)(?:\d+[.)]|[-*])\s/.test(prompt)) return "";
  return prompt;
}

export function normalizeHistory(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return [...new Set(value.map(normalizeRandomPrompt).filter(Boolean))].slice(-RANDOM_HISTORY_LIMIT);
}

export function rememberPrompt(history: string[], prompt: string): string[] {
  return normalizeHistory([...history.filter(item => item !== prompt), prompt]);
}

export function normalizeDraft(value: unknown): RandomDraft | null {
  if (!value || typeof value !== "object") return null;
  const draft = value as Partial<RandomDraft>;
  const prompt = normalizeRandomPrompt(draft.prompt);
  if (!prompt || typeof draft.signature !== "string" || draft.signature.length > 5000) return null;
  return { prompt, signature: draft.signature, seed: typeof draft.seed === "number" && Number.isSafeInteger(draft.seed) && draft.seed > 0 ? draft.seed : null };
}

export function randomInputSignature(settings: ActionSettings): string {
  return JSON.stringify([settings.mode, settings.randomCategory, settings.randomCreativity, settings.positivePrompt, settings.negativePrompt]);
}

const STOP_WORDS = new Set("a an the and or of in on at to with from over under through by for is its this that image scene view highly detailed beautiful cinematic lighting render".split(" "));
function tokens(prompt: string): Set<string> {
  return new Set((prompt.toLowerCase().normalize("NFKD").match(/[a-z0-9]+/g) ?? [])
    .filter(word => word.length > 2 && !STOP_WORDS.has(word))
    .map(word => word.length > 4 ? word.replace(/s$/, "") : word));
}

// Lexical similarity catches repeated scenes with reordered words or minor changes.
// Concept-level paraphrases are also discouraged by sending history to the LLM.
export function isRepeatedPrompt(prompt: string, history: string[]): boolean {
  const candidate = tokens(prompt);
  return history.some(previous => {
    const old = tokens(previous);
    if (!candidate.size || !old.size) return previous.toLowerCase() === prompt.toLowerCase();
    const shared = [...candidate].filter(word => old.has(word)).length;
    return shared / Math.min(candidate.size, old.size) >= 0.8
      || shared / (candidate.size + old.size - shared) >= 0.6;
  });
}
