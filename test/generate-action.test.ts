import assert from "node:assert/strict";
import test from "node:test";

import { GenerateAction } from "../src/actions/generate-action";
import type { ActionSettings, GenerationUpdate } from "../src/settings/types";
import { AppError } from "../src/utils/errors";

function createAction(id = "button-1", initial: Partial<ActionSettings> = {}) {
  const images: string[] = [];
  const saved: ActionSettings[] = [];
  let ok = 0;
  let alerts = 0;
  const handle = {
    id,
    async getSettings() { return initial; },
    async setSettings(value: ActionSettings) { saved.push(value); },
    async setImage(value: string) { images.push(value); },
    isKey() { return true; },
    async showOk() { ok += 1; },
    async showAlert() { alerts += 1; }
  };
  return { handle, images, saved, ok: () => ok, alerts: () => alerts };
}

function createSubject(overrides: ConstructorParameters<typeof GenerateAction>[0] = {}) {
  const updates: Array<{ id: string; update: GenerationUpdate }> = [];
  const subject = new GenerateAction({
    imageService: { async generateImage() { return "data:image/jpeg;base64,/9j/AA=="; } },
    getGlobalSettings: async () => ({ cloudflareAccountId: "account", cloudflareApiToken: "token" }),
    sendToPropertyInspector: async (id, update) => { updates.push({ id, update }); },
    ...overrides
  });
  return { subject, updates };
}

test("willAppear restores a V1 last image", async () => {
  const { subject } = createSubject();
  const action = createAction();
  await subject.onWillAppear({ action: action.handle, payload: { settings: { positive: "cat", base64Image: "legacy-image" } } } as never);
  assert.deepEqual(action.images, ["legacy-image"]);
});

test("didReceiveSettings restores an updated image", async () => {
  const { subject } = createSubject();
  const action = createAction();
  await subject.onDidReceiveSettings({ action: action.handle, payload: { settings: { lastImage: "new-image" } } } as never);
  assert.deepEqual(action.images, ["new-image"]);
});

for (const eventName of ["onKeyUp", "onDialUp", "onTouchTap"] as const) {
  test(`${eventName} triggers generation`, async () => {
    const { subject } = createSubject();
    const action = createAction();
    await subject[eventName]({ action: action.handle, payload: { settings: { positivePrompt: "cat" } } } as never);
    assert.equal(action.saved.length, 1);
  });
}

test("successful generation sets image, settings, state, and OK feedback", async () => {
  const { subject, updates } = createSubject();
  const action = createAction("button-1", { positivePrompt: "cat" });
  const image = await subject.generateForAction(action.handle as never, { positivePrompt: "cat" });
  assert.equal(image, "data:image/jpeg;base64,/9j/AA==");
  assert.equal(action.saved[0]?.lastImage, image);
  assert.equal(action.saved[0]?.lastResolvedPrompt, "cat");
  assert.equal(action.saved[0]?.lastImageSeed, null);
  assert.equal(action.images[0], image);
  assert.equal(action.ok(), 1);
  assert.equal(subject.getState("button-1"), "success");
  assert.deepEqual(updates.map(({ update }) => update.state), ["generating", "success"]);
});

test("variation mode keeps the prompt and sends a fresh image seed", async () => {
  let received: unknown;
  const { subject } = createSubject({
    randomSeed: () => 123,
    imageService: { async generateImage(options) { received = options; return "image"; } }
  });
  const action = createAction();
  await subject.generateForAction(action.handle as never, { mode: "variation", positivePrompt: "cat" });
  assert.equal((received as { prompt: string; seed: number }).prompt, "cat");
  assert.equal((received as { seed: number }).seed, 123);
  assert.equal(action.saved[0]?.lastImageSeed, 123);
});

test("random AI generates a guided prompt before requesting the image and saves both seeds", async () => {
  const order: string[] = [];
  let imagePrompt = "";
  const seeds = [101, 202];
  const { subject } = createSubject({
    randomSeed: () => seeds.shift() ?? 0,
    textPromptService: { async generatePrompt(options) {
      order.push("text");
      assert.equal(options.category, "surreal");
      assert.equal(options.userPrompt, "floating city");
      assert.equal(options.seed, 101);
      return { prompt: "A glass city floating over violet clouds", seed: options.seed ?? null };
    } },
    imageService: { async generateImage(options) { order.push("image"); imagePrompt = options.prompt; assert.equal(options.seed, 202); return "image"; } }
  });
  const action = createAction();
  await subject.generateForAction(action.handle as never, { mode: "random-ai", randomCategory: "surreal", positivePrompt: "floating city" });
  assert.deepEqual(order, ["text", "image"]);
  assert.equal(imagePrompt, "A glass city floating over violet clouds");
  assert.equal(action.saved[0]?.lastResolvedPrompt, imagePrompt);
  assert.equal(action.saved[0]?.lastPromptSeed, 101);
  assert.equal(action.saved[0]?.lastImageSeed, 202);
});

test("random AI text failure does not call the image service", async () => {
  let imageCalls = 0;
  const { subject } = createSubject({
    textPromptService: { async generatePrompt() { throw new AppError("TEXT_GENERATION_FAILED", "Random prompt generation failed."); } },
    imageService: { async generateImage() { imageCalls += 1; return "image"; } }
  });
  const action = createAction();
  await subject.generateForAction(action.handle as never, { mode: "random-ai" });
  assert.equal(imageCalls, 0);
  assert.equal(action.alerts(), 1);
});

test("concurrent generation for one context is ignored while other contexts remain independent", async () => {
  let resolveFirst: ((image: string) => void) | undefined;
  let calls = 0;
  const { subject } = createSubject({ imageService: { generateImage: async ({ prompt }) => {
    calls += 1;
    if (prompt === "blue") return "data:image/png;base64,iVBORw0KGgo=";
    return new Promise<string>((resolve) => { resolveFirst = resolve; });
  } } });
  const first = createAction("button-1");
  const second = createAction("button-2");
  const pending = subject.generateForAction(first.handle as never, { positivePrompt: "red" });
  await new Promise<void>((resolve) => queueMicrotask(resolve));
  assert.equal(await subject.generateForAction(first.handle as never, { positivePrompt: "red" }), null);
  const other = subject.generateForAction(second.handle as never, { positivePrompt: "blue" });
  await other;
  assert.equal(calls, 2);
  resolveFirst?.("data:image/png;base64,iVBORw0KGgo=");
  await pending;
});

test("Cloudflare failure reports safe details and alerts", async () => {
  const { subject, updates } = createSubject({ imageService: { async generateImage() {
    throw new AppError("HTTP_ERROR", "Cloudflare image generation failed.", 503);
  } } });
  const action = createAction();
  assert.equal(await subject.generateForAction(action.handle as never, { positivePrompt: "cat" }), null);
  assert.equal(action.alerts(), 1);
  assert.equal(subject.getState("button-1"), "error");
  assert.deepEqual(updates.at(-1)?.update.details, {
    code: "HTTP_ERROR",
    httpStatus: 503,
    message: "Cloudflare image generation failed."
  });
});

test("settings timeout releases the action for a later generation", async () => {
  const { subject } = createSubject({ getGlobalSettings: async () => new Promise(() => undefined), settingsTimeoutMs: 5 });
  const action = createAction();
  assert.equal(await subject.generateForAction(action.handle as never, { positivePrompt: "cat" }), null);
  assert.equal(subject.getState("button-1"), "error");
});

test("generation timeout aborts the service and reports an error", async () => {
  const { subject } = createSubject({
    generationTimeoutMs: 5,
    imageService: { generateImage: async ({ signal }) => new Promise<string>((_resolve, reject) => {
      signal?.addEventListener("abort", () => reject(new Error("aborted")), { once: true });
    }) }
  });
  const action = createAction();
  assert.equal(await subject.generateForAction(action.handle as never, { positivePrompt: "cat" }), null);
  assert.equal(subject.getState("button-1"), "error");
});

test("Property Inspector message persists prompts and generates", async () => {
  const { subject } = createSubject();
  const action = createAction("button-1", { lastImage: "old-image" });
  await subject.onSendToPlugin({
    action: action.handle,
    payload: { type: "generate", positivePrompt: "cat", negativePrompt: "blur" }
  } as never);
  assert.equal(action.saved[0]?.positivePrompt, "cat");
  assert.equal(action.saved.at(-1)?.lastImage, "data:image/jpeg;base64,/9j/AA==");
});
