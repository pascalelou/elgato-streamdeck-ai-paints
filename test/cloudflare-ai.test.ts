import assert from "node:assert/strict";
import test from "node:test";

import { CloudflareImageService, MODEL, toImageDataUrl } from "../src/services/cloudflare-ai";
import { AppError } from "../src/utils/errors";

const credentials = { accountId: "test-account", apiToken: "test-token" };

function jsonResponse(payload: unknown, status = 200): Response {
  return new Response(JSON.stringify(payload), { status, headers: { "content-type": "application/json" } });
}

function success(image = Buffer.from([0xff, 0xd8, 0xff, 0x00]).toString("base64")): Response {
  return jsonResponse({ success: true, result: { image } });
}

async function expectCode(service: CloudflareImageService, options: Parameters<CloudflareImageService["generateImage"]>[0], code: string) {
  await assert.rejects(service.generateImage(options), (error: unknown) => error instanceof AppError && error.code === code);
}

test("empty prompt and missing credentials fail before fetch", async () => {
  let calls = 0;
  const service = new CloudflareImageService({ fetchImpl: async () => { calls += 1; return success(); } });
  await expectCode(service, { prompt: " ", credentials }, "PROMPT_REQUIRED");
  await expectCode(service, { prompt: "cat", credentials: { accountId: "", apiToken: "x" } }, "CREDENTIALS_MISSING");
  await expectCode(service, { prompt: "cat", credentials: { accountId: "x", apiToken: "" } }, "CREDENTIALS_MISSING");
  assert.equal(calls, 0);
});

test("request uses the fixed model and multipart prompt fields", async () => {
  let request: { url: string; init?: RequestInit } | undefined;
  const service = new CloudflareImageService({ fetchImpl: async (url, init) => {
    request = { url: String(url), init };
    return success();
  } });
  await service.generateImage({ prompt: "red stopwatch", negativePrompt: "text", credentials, seed: 42 });
  assert.equal(request?.url, `https://api.cloudflare.com/client/v4/accounts/test-account/ai/run/${MODEL}`);
  assert.equal(request?.init?.method, "POST");
  assert.equal((request?.init?.headers as Record<string, string>).Authorization, "Bearer test-token");
  const body = request?.init?.body as FormData;
  assert.equal(body.get("prompt"), "red stopwatch\n\nAvoid: text");
  assert.equal(body.get("width"), "512");
  assert.equal(body.get("height"), "512");
  assert.equal(body.get("seed"), "42");
});

for (const [name, status, code] of [
  ["401", 401, "AUTHENTICATION_FAILED"],
  ["403", 403, "AUTHENTICATION_FAILED"],
  ["429", 429, "QUOTA_REACHED"],
  ["500", 500, "HTTP_ERROR"]
] as const) {
  test(`HTTP ${name} is mapped`, async () => {
    const service = new CloudflareImageService({ fetchImpl: async () => jsonResponse({}, status) });
    await expectCode(service, { prompt: "cat", credentials }, code);
  });
}

test("missing image and invalid JSON are rejected", async () => {
  const missing = new CloudflareImageService({ fetchImpl: async () => jsonResponse({ success: true, result: {} }) });
  await expectCode(missing, { prompt: "cat", credentials }, "INVALID_RESPONSE");
  const invalidJson = new CloudflareImageService({ fetchImpl: async () => new Response("not-json", { headers: { "content-type": "application/json" } }) });
  await expectCode(invalidJson, { prompt: "cat", credentials }, "INVALID_RESPONSE");
});

test("network errors and timeouts are distinguished", async () => {
  const network = new CloudflareImageService({ fetchImpl: async () => { throw new Error("offline"); } });
  await expectCode(network, { prompt: "cat", credentials }, "NETWORK_ERROR");

  const timeout = new CloudflareImageService({
    networkTimeoutMs: 5,
    fetchImpl: async (_url, init) => new Promise<Response>((_resolve, reject) => {
      init?.signal?.addEventListener("abort", () => reject(new DOMException("aborted", "AbortError")), { once: true });
    })
  });
  await expectCode(timeout, { prompt: "cat", credentials }, "NETWORK_TIMEOUT");
});

test("PNG, JPEG, and WebP payloads receive the right data URL type", () => {
  const values = [
    ["image/png", Buffer.from([0x89, 0x50, 0x4e, 0x47])],
    ["image/jpeg", Buffer.from([0xff, 0xd8, 0xff, 0x00])],
    ["image/webp", Buffer.from("RIFF1234WEBP")]
  ] as const;
  for (const [mime, bytes] of values) assert.match(toImageDataUrl(bytes.toString("base64")), new RegExp(`^data:${mime};base64,`));
});

test("binary image responses are supported", async () => {
  const bytes = Buffer.from([0x89, 0x50, 0x4e, 0x47]);
  const service = new CloudflareImageService({ fetchImpl: async () => new Response(bytes, { headers: { "content-type": "image/png" } }) });
  assert.equal(await service.generateImage({ prompt: "cat", credentials }), `data:image/png;base64,${bytes.toString("base64")}`);
});
