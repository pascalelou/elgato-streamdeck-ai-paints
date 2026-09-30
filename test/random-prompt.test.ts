import assert from "node:assert/strict";
import test from "node:test";
import { isRepeatedPrompt, normalizeRandomPrompt, normalizeHistory, rememberPrompt, randomInputSignature, RANDOM_HISTORY_LIMIT } from "../src/services/random-prompt";
import { normalizeActionSettings } from "../src/settings/normalize";

const fox = "A red fox in a moonlit woodland, watercolor, close framing";
test("validation normalizes wrappers and rejects invalid model output instead of truncating", () => {
  assert.equal(normalizeRandomPrompt(`\nPrompt: "${fox}"\n`), fox);
  for (const value of [undefined, "", "fox", '{"prompt":"a fox in woodland"}', "Sorry, I cannot generate this prompt", "1. A red fox 2. A blue whale", "x ".repeat(400)]) {
    assert.equal(normalizeRandomPrompt(value), "");
  }
});
test("history is bounded, deduplicated, and sanitized", () => {
  const history = Array.from({ length: 20 }, (_, i) => `A sculpted glass creature number ${i}`);
  assert.deepEqual(normalizeHistory([null, ...history, ""]), history.slice(-RANDOM_HISTORY_LIMIT));
  assert.deepEqual(rememberPrompt([fox, history[0]!], fox), [history[0], fox]);
  assert.deepEqual(normalizeHistory({}), []);
});
test("similar scenes are rejected despite reordered words and added detail", () => {
  assert.equal(isRepeatedPrompt(fox.toUpperCase(), [fox]), true);
  assert.equal(isRepeatedPrompt("Watercolor of a red fox in moonlit woodland with close framing and golden leaves", [fox]), true);
  assert.equal(isRepeatedPrompt("An orbital station above Jupiter, metallic sculpture, wide angle", [fox]), false);
});
test("draft signatures include every random constraint and malformed persisted data is discarded", () => {
  const settings = normalizeActionSettings({ mode: "random-ai" });
  for (const change of [{ mode: "prompt" }, { randomCategory: "fantasy" }, { randomCreativity: "high" }, { positivePrompt: "fox" }, { negativePrompt: "text" }]) {
    assert.notEqual(randomInputSignature(settings), randomInputSignature(normalizeActionSettings({ ...settings, ...change })));
  }
  assert.equal(normalizeActionSettings({ randomDraft: { prompt: fox, signature: 5 }, randomCreativity: "invalid" }).randomDraft, null);
  assert.equal(normalizeActionSettings({ randomCreativity: "invalid" }).randomCreativity, "balanced");
});
