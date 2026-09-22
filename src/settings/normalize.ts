import type { ActionSettings, Credentials, GenerationMode, GlobalSettings, LegacyActionSettings, RandomCategory } from "./types";

const MODES = new Set<GenerationMode>(["prompt", "variation", "random-ai"]);
const CATEGORIES = new Set<RandomCategory>([
  "everything", "landscape", "animals", "sci-fi", "fantasy", "architecture", "abstract", "cute", "dark", "surreal"
]);

function text(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function nullableSeed(value: unknown): number | null {
  return typeof value === "number" && Number.isSafeInteger(value) && value >= 0 ? value : null;
}

export function normalizeActionSettings(value: unknown): ActionSettings {
  const settings = value && typeof value === "object" ? (value as LegacyActionSettings) : {};
  return {
    positivePrompt: text(settings.positivePrompt) || text(settings.positive),
    negativePrompt: text(settings.negativePrompt) || text(settings.negative),
    lastImage: text(settings.lastImage) || text(settings.base64Image),
    mode: MODES.has(settings.mode as GenerationMode) ? settings.mode as GenerationMode : "prompt",
    randomCategory: CATEGORIES.has(settings.randomCategory as RandomCategory) ? settings.randomCategory as RandomCategory : "everything",
    lastResolvedPrompt: text(settings.lastResolvedPrompt),
    lastPromptSeed: nullableSeed(settings.lastPromptSeed),
    lastImageSeed: nullableSeed(settings.lastImageSeed)
  };
}

export function normalizeGlobalSettings(value: unknown): GlobalSettings {
  const settings = value && typeof value === "object" ? (value as Partial<GlobalSettings>) : {};
  return {
    cloudflareAccountId: text(settings.cloudflareAccountId),
    cloudflareApiToken: text(settings.cloudflareApiToken)
  };
}

export function toCredentials(settings: GlobalSettings): Credentials {
  return {
    accountId: settings.cloudflareAccountId,
    apiToken: settings.cloudflareApiToken
  };
}
