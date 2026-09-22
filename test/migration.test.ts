import assert from "node:assert/strict";
import test from "node:test";

import { normalizeActionSettings, normalizeGlobalSettings } from "../src/settings/normalize";

const defaults = { mode: "prompt", randomCategory: "everything", lastResolvedPrompt: "", lastPromptSeed: null, lastImageSeed: null } as const;

test("migration case A: configured V1 key without an image", () => {
  assert.deepEqual(normalizeActionSettings({ positive: "cat", negative: "blur" }), {
    positivePrompt: "cat",
    negativePrompt: "blur",
    lastImage: "",
    ...defaults
  });
});

test("migration case B: V1 prompts, global credentials, and last image", () => {
  const action = normalizeActionSettings({ positive: "cat", negative: "blur", base64Image: "data:image/jpeg;base64,/9j/AA==" });
  const global = normalizeGlobalSettings({ cloudflareAccountId: "account", cloudflareApiToken: "token" });
  assert.equal(action.positivePrompt, "cat");
  assert.equal(action.negativePrompt, "blur");
  assert.equal(action.lastImage, "data:image/jpeg;base64,/9j/AA==");
  assert.deepEqual(global, { cloudflareAccountId: "account", cloudflareApiToken: "token" });
});

test("migration case C: multiple V1 keys retain distinct prompts and shared credentials", () => {
  const keys = [
    normalizeActionSettings({ positive: "red stopwatch", base64Image: "red-image" }),
    normalizeActionSettings({ positive: "blue computer", base64Image: "blue-image" })
  ];
  const global = normalizeGlobalSettings({ cloudflareAccountId: "account", cloudflareApiToken: "token" });
  assert.deepEqual(keys.map(({ positivePrompt }) => positivePrompt), ["red stopwatch", "blue computer"]);
  assert.deepEqual(keys.map(({ lastImage }) => lastImage), ["red-image", "blue-image"]);
  assert.equal(global.cloudflareAccountId, "account");
});
