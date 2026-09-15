import type { ActionSettings, Credentials, GlobalSettings, LegacyActionSettings } from "./types";

function text(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

export function normalizeActionSettings(value: unknown): ActionSettings {
  const settings = value && typeof value === "object" ? (value as LegacyActionSettings) : {};
  return {
    positivePrompt: text(settings.positivePrompt) || text(settings.positive),
    negativePrompt: text(settings.negativePrompt) || text(settings.negative),
    lastImage: text(settings.lastImage) || text(settings.base64Image)
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
