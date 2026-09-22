import type { Credentials, RandomCategory } from "../settings/types";
import { AppError, USER_MESSAGES } from "../utils/errors";
import { createLogger, type Logger } from "../utils/logging";

export const TEXT_MODEL = "@cf/meta/llama-3.1-8b-instruct-fast";
export const DEFAULT_TEXT_TIMEOUT_MS = 30_000;
const MAX_PROMPT_LENGTH = 700;

type Fetch = typeof fetch;

export type GeneratePromptOptions = {
  category: RandomCategory;
  userPrompt?: string;
  negativePrompt?: string;
  signal?: AbortSignal;
  credentials: Credentials;
  seed?: number;
};

export type GeneratedPromptResult = {
  prompt: string;
  seed: number | null;
  rawText?: string;
};

type ServiceOptions = { fetchImpl?: Fetch; networkTimeoutMs?: number; logger?: Logger };

export class CloudflareTextPromptService {
  private readonly fetchImpl: Fetch;
  private readonly networkTimeoutMs: number;
  private readonly logger: Logger;

  constructor(options: ServiceOptions = {}) {
    this.fetchImpl = options.fetchImpl ?? fetch;
    this.networkTimeoutMs = options.networkTimeoutMs ?? DEFAULT_TEXT_TIMEOUT_MS;
    this.logger = options.logger ?? createLogger("CloudflareText");
  }

  async generatePrompt(options: GeneratePromptOptions): Promise<GeneratedPromptResult> {
    const accountId = options.credentials.accountId.trim();
    const apiToken = options.credentials.apiToken.trim();
    if (!accountId || !apiToken) throw new AppError("CREDENTIALS_MISSING", USER_MESSAGES.credentials);

    const controller = new AbortController();
    const abortFromParent = () => controller.abort(options.signal?.reason);
    options.signal?.addEventListener("abort", abortFromParent, { once: true });
    const timeout = setTimeout(() => controller.abort(new Error("text generation timeout")), this.networkTimeoutMs);
    const url = `https://api.cloudflare.com/client/v4/accounts/${encodeURIComponent(accountId)}/ai/run/${TEXT_MODEL}`;
    const body = {
      messages: [
        { role: "system", content: systemInstruction() },
        { role: "user", content: userInstruction(options) }
      ],
      max_tokens: 120,
      temperature: 1,
      ...(options.seed === undefined ? {} : { seed: options.seed })
    };

    this.logger.info("Random prompt request started", { model: TEXT_MODEL, category: options.category });
    try {
      const response = await this.fetchImpl(url, {
        method: "POST",
        headers: { Authorization: `Bearer ${apiToken}`, "Content-Type": "application/json" },
        body: JSON.stringify(body),
        signal: controller.signal
      });
      const payload = await readJson(response);
      if (!response.ok) throw mapHttpError(response.status, payload);
      const rawText = extractText(payload);
      const prompt = cleanPrompt(rawText);
      if (!prompt) throw new AppError("TEXT_INVALID_RESPONSE", USER_MESSAGES.textInvalidResponse, response.status);
      this.logger.info("Random prompt generated", { category: options.category, length: prompt.length });
      return { prompt, seed: options.seed ?? null, rawText };
    } catch (error) {
      if (error instanceof AppError) throw error;
      if (controller.signal.aborted) {
        throw new AppError("TEXT_GENERATION_TIMEOUT", USER_MESSAGES.textTimeout, null, { cause: error as Error });
      }
      throw new AppError("TEXT_GENERATION_FAILED", USER_MESSAGES.textFailed, null, { cause: error as Error });
    } finally {
      clearTimeout(timeout);
      options.signal?.removeEventListener("abort", abortFromParent);
    }
  }
}

function systemInstruction(): string {
  return "You create one original image-generation prompt for an image model. Return only one final prompt in English. Make it vivid, visual, and specific, under 70 words. Do not use quotation marks, lists, labels, introductions, or explanations. Match the requested category and avoid clichés.";
}

function userInstruction(options: GeneratePromptOptions): string {
  return `Category: ${options.category}\nOptional user direction: ${options.userPrompt?.trim() || "none"}\nOptional things to avoid: ${options.negativePrompt?.trim() || "none"}`;
}

type TextPayload = {
  success?: boolean;
  result?: { response?: unknown };
  errors?: Array<string | { message?: string }>;
  message?: string;
};

async function readJson(response: Response): Promise<TextPayload | null> {
  try { return await response.json() as TextPayload; } catch { return null; }
}

function extractText(payload: TextPayload | null): string {
  return typeof payload?.result?.response === "string" ? payload.result.response : "";
}

export function cleanPrompt(value: unknown): string {
  if (typeof value !== "string") return "";
  const cleaned = value.trim().replace(/^```(?:text)?\s*/i, "").replace(/\s*```$/, "").replace(/^(?:prompt|final prompt)\s*:\s*/i, "").replace(/^(["'])|(["'])$/g, "").replace(/\s+/g, " ").trim();
  return cleaned.slice(0, MAX_PROMPT_LENGTH).trim();
}

function mapHttpError(status: number, payload: TextPayload | null): AppError {
  const errorText = [payload?.message, ...(payload?.errors ?? []).map((item) => typeof item === "string" ? item : item.message)].filter(Boolean).join(" ");
  if (status === 401 || status === 403) return new AppError("AUTHENTICATION_FAILED", USER_MESSAGES.authentication, status);
  if (status === 429 || /quota|rate[ -]?limit/i.test(errorText)) return new AppError("QUOTA_REACHED", USER_MESSAGES.quota, status);
  return new AppError("TEXT_GENERATION_FAILED", USER_MESSAGES.textFailed, status);
}
