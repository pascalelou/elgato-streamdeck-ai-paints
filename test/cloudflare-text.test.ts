import assert from "node:assert/strict";
import test from "node:test";

import { cleanPrompt, CloudflareTextPromptService, TEXT_MODEL } from "../src/services/cloudflare-text";
import { AppError } from "../src/utils/errors";

const credentials = { accountId: "account", apiToken: "token" };
const options = { category: "fantasy" as const, credentials, seed: 17 };

test("text prompt request uses the configured model, guidance, and seed", async () => {
  let request: { url: string; init?: RequestInit } | undefined;
  const service = new CloudflareTextPromptService({ fetchImpl: async (url, init) => {
    request = { url: String(url), init };
    return Response.json({ success: true, result: { response: "Prompt: A moonlit library grown inside an ancient tree" } });
  } });
  const result = await service.generatePrompt({ ...options, userPrompt: "library", negativePrompt: "text" });
  assert.equal(result.prompt, "A moonlit library grown inside an ancient tree");
  assert.equal(result.seed, 17);
  assert.equal(request?.url, `https://api.cloudflare.com/client/v4/accounts/account/ai/run/${TEXT_MODEL}`);
  const body = JSON.parse(String(request?.init?.body)) as { messages: Array<{ content: string }>; seed: number };
  assert.equal(body.seed, 17);
  assert.match(body.messages[1]?.content ?? "", /Category: fantasy/);
  assert.match(body.messages[1]?.content ?? "", /library/);
});

test("empty and malformed text responses are rejected", async () => {
  for (const payload of [{ success: true, result: { response: " " } }, { success: true, result: {} }]) {
    const service = new CloudflareTextPromptService({ fetchImpl: async () => Response.json(payload) });
    await assert.rejects(service.generatePrompt(options), (error: unknown) => error instanceof AppError && error.code === "TEXT_INVALID_RESPONSE");
  }
});

test("HTTP, network, and timeout failures have text-specific error codes", async () => {
  const http = new CloudflareTextPromptService({ fetchImpl: async () => Response.json({}, { status: 500 }) });
  await assert.rejects(http.generatePrompt(options), (error: unknown) => error instanceof AppError && error.code === "TEXT_GENERATION_FAILED");

  const network = new CloudflareTextPromptService({ fetchImpl: async () => { throw new Error("offline"); } });
  await assert.rejects(network.generatePrompt(options), (error: unknown) => error instanceof AppError && error.code === "TEXT_GENERATION_FAILED");

  const timeout = new CloudflareTextPromptService({ networkTimeoutMs: 5, fetchImpl: async (_url, init) => new Promise((_resolve, reject) => {
    init?.signal?.addEventListener("abort", () => reject(new Error("aborted")), { once: true });
  }) });
  await assert.rejects(timeout.generatePrompt(options), (error: unknown) => error instanceof AppError && error.code === "TEXT_GENERATION_TIMEOUT");
});

test("prompt cleanup removes common model wrappers", () => {
  assert.equal(cleanPrompt("```text\nFinal prompt: \"A vivid red fox\"\n```"), "A vivid red fox");
});
