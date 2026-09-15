export const USER_MESSAGES = Object.freeze({
  credentials: "Cloudflare credentials missing.",
  prompt: "Prompt is required.",
  authentication: "Cloudflare authentication failed. Check Account ID and API Token.",
  quota: "Cloudflare Workers AI quota or rate limit reached.",
  network: "Unable to reach Cloudflare Workers AI.",
  timeout: "Cloudflare image generation timed out.",
  invalidResponse: "Cloudflare returned no image.",
  generic: "Cloudflare image generation failed."
});

export class AppError extends Error {
  constructor(
    public readonly code: string,
    public readonly userMessage: string,
    public readonly status: number | null = null,
    options?: ErrorOptions
  ) {
    super(userMessage, options);
    this.name = "AppError";
  }
}

export function toAppError(error: unknown): AppError {
  if (error instanceof AppError) return error;
  return new AppError("UNKNOWN", USER_MESSAGES.generic, null, {
    cause: error instanceof Error ? error : undefined
  });
}
