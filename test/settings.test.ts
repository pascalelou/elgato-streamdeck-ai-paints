import assert from "node:assert/strict";
import test from "node:test";

import { normalizeActionSettings, normalizeGlobalSettings, toCredentials } from "../src/settings/normalize";

const defaults = { mode: "prompt", randomCategory: "everything", lastResolvedPrompt: "", lastPromptSeed: null, lastImageSeed: null } as const;

test("V1 action settings migrate to V2 names", () => {
  assert.deepEqual(normalizeActionSettings({ positive: " cat ", negative: " blur ", base64Image: " data:image/jpeg;base64,eA== " }), {
    positivePrompt: "cat",
    negativePrompt: "blur",
    lastImage: "data:image/jpeg;base64,eA==",
    ...defaults
  });
});

test("V2 names take precedence over V1 aliases", () => {
  assert.deepEqual(normalizeActionSettings({ positivePrompt: "new", positive: "old", negativePrompt: "clean", negative: "legacy", lastImage: "new-image", base64Image: "old-image" }), {
    positivePrompt: "new",
    negativePrompt: "clean",
    lastImage: "new-image",
    ...defaults
  });
});

test("absent and partial settings normalize safely", () => {
  assert.deepEqual(normalizeActionSettings(undefined), { positivePrompt: "", negativePrompt: "", lastImage: "", ...defaults });
  assert.deepEqual(normalizeActionSettings({ positive: "cat" }), { positivePrompt: "cat", negativePrompt: "", lastImage: "", ...defaults });
});

test("generation settings accept valid values and reject invalid values", () => {
  assert.deepEqual(normalizeActionSettings({ mode: "random-ai", randomCategory: "surreal", lastResolvedPrompt: " dream ", lastPromptSeed: 12, lastImageSeed: 34 }), {
    positivePrompt: "", negativePrompt: "", lastImage: "", mode: "random-ai", randomCategory: "surreal",
    lastResolvedPrompt: "dream", lastPromptSeed: 12, lastImageSeed: 34
  });
  const invalid = normalizeActionSettings({ mode: "unknown", randomCategory: "nope", lastPromptSeed: -1, lastImageSeed: 1.2 });
  assert.equal(invalid.mode, "prompt");
  assert.equal(invalid.randomCategory, "everything");
  assert.equal(invalid.lastPromptSeed, null);
  assert.equal(invalid.lastImageSeed, null);
});

test("global settings preserve historical credential names", () => {
  const global = normalizeGlobalSettings({ cloudflareAccountId: " account ", cloudflareApiToken: " token " });
  assert.deepEqual(global, { cloudflareAccountId: "account", cloudflareApiToken: "token" });
  assert.deepEqual(toCredentials(global), { accountId: "account", apiToken: "token" });
  assert.deepEqual(normalizeGlobalSettings(null), { cloudflareAccountId: "", cloudflareApiToken: "" });
});
