import type { Credentials } from "../settings/types";
import { AppError, USER_MESSAGES } from "../utils/errors";
import { createLogger, type Logger } from "../utils/logging";

export const MODEL = "@cf/black-forest-labs/flux-2-klein-4b";
export const IMAGE_WIDTH = 512;
export const IMAGE_HEIGHT = 512;
export const DEFAULT_NETWORK_TIMEOUT_MS = 90_000;

type Fetch = typeof fetch;

export type GenerateImageOptions = {
  prompt: string;
  negativePrompt?: string;
  credentials: Credentials;
  signal?: AbortSignal;
};

type ServiceOptions = {
  fetchImpl?: Fetch;
  networkTimeoutMs?: number;
  logger?: Logger;
};

export class CloudflareImageService {
  private readonly fetchImpl: Fetch;
  private readonly networkTimeoutMs: number;
  private readonly logger: Logger;

  constructor(options: ServiceOptions = {}) {
    this.fetchImpl = options.fetchImpl ?? fetch;
    this.networkTimeoutMs = options.networkTimeoutMs ?? DEFAULT_NETWORK_TIMEOUT_MS;
    this.logger = options.logger ?? createLogger("CloudflareAI");
  }

  async generateImage(options: GenerateImageOptions): Promise<string> {
    const prompt = buildPrompt(options.prompt, options.negativePrompt);
    const accountId = options.credentials.accountId.trim();
    const apiToken = options.credentials.apiToken.trim();
    if (!accountId || !apiToken) {
      throw new AppError("CREDENTIALS_MISSING", USER_MESSAGES.credentials);
    }

    const controller = new AbortController();
    const abortFromParent = () => controller.abort(options.signal?.reason);
    options.signal?.addEventListener("abort", abortFromParent, { once: true });
    const timeout = setTimeout(() => controller.abort(new Error("network timeout")), this.networkTimeoutMs);

    const formData = new FormData();
    formData.append("prompt", prompt);
    formData.append("width", String(IMAGE_WIDTH));
    formData.append("height", String(IMAGE_HEIGHT));
    const url = `https://api.cloudflare.com/client/v4/accounts/${encodeURIComponent(accountId)}/ai/run/${MODEL}`;

    this.logger.info("Request started", { model: MODEL });
    try {
      const response = await this.fetchImpl(url, {
        method: "POST",
        headers: { Authorization: `Bearer ${apiToken}` },
        body: formData,
        signal: controller.signal
      });
      this.logger.info(`HTTP ${response.status}`);
      return await parseImageResponse(response);
    } catch (error) {
      if (error instanceof AppError) throw error;
      if (controller.signal.aborted) {
        throw new AppError("NETWORK_TIMEOUT", USER_MESSAGES.timeout, null, { cause: error as Error });
      }
      throw new AppError("NETWORK_ERROR", USER_MESSAGES.network, null, { cause: error as Error });
    } finally {
      clearTimeout(timeout);
      options.signal?.removeEventListener("abort", abortFromParent);
    }
  }
}

export function buildPrompt(positivePrompt: unknown, negativePrompt?: unknown): string {
  const positive = typeof positivePrompt === "string" ? positivePrompt.trim() : "";
  const negative = typeof negativePrompt === "string" ? negativePrompt.trim() : "";
  if (!positive) throw new AppError("PROMPT_REQUIRED", USER_MESSAGES.prompt);
  return negative ? `${positive}\n\nAvoid: ${negative}` : positive;
}

export function detectMimeType(bytes: Uint8Array): string {
  if (bytes[0] === 0x89 && bytes[1] === 0x50 && bytes[2] === 0x4e && bytes[3] === 0x47) return "image/png";
  if (bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) return "image/jpeg";
  if (String.fromCharCode(...bytes.slice(0, 4)) === "RIFF" && String.fromCharCode(...bytes.slice(8, 12)) === "WEBP") return "image/webp";
  return "image/jpeg";
}

function base64ToBytes(base64: string): Uint8Array {
  return Uint8Array.from(Buffer.from(base64, "base64"));
}

export function toImageDataUrl(image: unknown): string {
  const value = typeof image === "string" ? image.trim() : "";
  if (!value) throw new AppError("INVALID_RESPONSE", USER_MESSAGES.invalidResponse);
  if (/^data:image\/(?:png|jpeg|webp);base64,[a-z0-9+/=]+$/i.test(value)) return value;

  const bytes = base64ToBytes(value);
  if (!bytes.length || Buffer.from(bytes).toString("base64").replace(/=+$/, "") !== value.replace(/=+$/, "")) {
    throw new AppError("INVALID_RESPONSE", USER_MESSAGES.invalidResponse);
  }
  return `data:${detectMimeType(bytes)};base64,${value}`;
}

async function parseImageResponse(response: Response): Promise<string> {
  const contentType = response.headers.get("content-type")?.toLowerCase() ?? "";
  if (!response.ok) {
    const apiErrorText = contentType.includes("json") ? errorText(await readJsonSafely(response)) : "";
    if (response.status === 401 || response.status === 403) {
      throw new AppError("AUTHENTICATION_FAILED", USER_MESSAGES.authentication, response.status);
    }
    if (response.status === 429 || /quota|rate[ -]?limit|limit reached|limit exceeded/i.test(apiErrorText)) {
      throw new AppError("QUOTA_REACHED", USER_MESSAGES.quota, response.status);
    }
    throw new AppError("HTTP_ERROR", USER_MESSAGES.generic, response.status);
  }

  if (contentType.startsWith("image/")) {
    const bytes = new Uint8Array(await response.arrayBuffer());
    if (!bytes.length) throw new AppError("INVALID_RESPONSE", USER_MESSAGES.invalidResponse, response.status);
    const mime = ["image/png", "image/jpeg", "image/webp"].includes(contentType.split(";")[0] ?? "")
      ? contentType.split(";")[0]
      : detectMimeType(bytes);
    return `data:${mime};base64,${Buffer.from(bytes).toString("base64")}`;
  }

  const data = await readJsonSafely(response);
  const apiErrorText = errorText(data);
  if (/quota|rate[ -]?limit|limit reached|limit exceeded/i.test(apiErrorText)) {
    throw new AppError("QUOTA_REACHED", USER_MESSAGES.quota, response.status);
  }
  if (!data || data.success !== true || typeof data.result?.image !== "string") {
    throw new AppError("INVALID_RESPONSE", USER_MESSAGES.invalidResponse, response.status);
  }
  return toImageDataUrl(data.result.image);
}

type CloudflarePayload = { success?: boolean; result?: { image?: unknown }; errors?: Array<string | { message?: string }>; message?: string };

async function readJsonSafely(response: Response): Promise<CloudflarePayload | null> {
  try {
    return (await response.json()) as CloudflarePayload;
  } catch {
    return null;
  }
}

function errorText(payload: CloudflarePayload | null): string {
  if (!payload) return "";
  const messages = (payload.errors ?? []).flatMap((item) =>
    typeof item === "string" ? [item] : typeof item.message === "string" ? [item.message] : []
  );
  if (typeof payload.message === "string") messages.push(payload.message);
  return messages.join(" ");
}
