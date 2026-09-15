import assert from "node:assert/strict";
import test from "node:test";

import { normalizeActionSettings, normalizeGlobalSettings, toCredentials } from "../src/settings/normalize";

test("V1 action settings migrate to V2 names", () => {
  assert.deepEqual(normalizeActionSettings({ positive: " cat ", negative: " blur ", base64Image: " data:image/jpeg;base64,eA== " }), {
    positivePrompt: "cat",
    negativePrompt: "blur",
    lastImage: "data:image/jpeg;base64,eA=="
  });
});

test("V2 names take precedence over V1 aliases", () => {
  assert.deepEqual(normalizeActionSettings({ positivePrompt: "new", positive: "old", negativePrompt: "clean", negative: "legacy", lastImage: "new-image", base64Image: "old-image" }), {
    positivePrompt: "new",
    negativePrompt: "clean",
    lastImage: "new-image"
  });
});

test("absent and partial settings normalize safely", () => {
  assert.deepEqual(normalizeActionSettings(undefined), { positivePrompt: "", negativePrompt: "", lastImage: "" });
  assert.deepEqual(normalizeActionSettings({ positive: "cat" }), { positivePrompt: "cat", negativePrompt: "", lastImage: "" });
});

test("global settings preserve historical credential names", () => {
  const global = normalizeGlobalSettings({ cloudflareAccountId: " account ", cloudflareApiToken: " token " });
  assert.deepEqual(global, { cloudflareAccountId: "account", cloudflareApiToken: "token" });
  assert.deepEqual(toCredentials(global), { accountId: "account", apiToken: "token" });
  assert.deepEqual(normalizeGlobalSettings(null), { cloudflareAccountId: "", cloudflareApiToken: "" });
});
