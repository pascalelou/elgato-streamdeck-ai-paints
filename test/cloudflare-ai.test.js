const test = require('node:test');
const assert = require('node:assert/strict');

const CloudflareAI = require('../src/com.f00d4tehg0dz.aipaints.sdPlugin/cloudflare-ai.js');
const { createPluginRuntime } = require('../src/com.f00d4tehg0dz.aipaints.sdPlugin/app.js');

async function expectNoFetch(options, expectedCode) {
  let fetchCalls = 0;
  await assert.rejects(
    CloudflareAI.requestImage({
      ...options,
      fetchImpl: async () => { fetchCalls += 1; }
    }),
    (error) => error.code === expectedCode
  );
  assert.equal(fetchCalls, 0);
}

test('missing Account ID prevents fetch', async () => {
  await expectNoFetch({ apiToken: 'test-token', positivePrompt: 'cat' }, 'CREDENTIALS_MISSING');
});

test('missing token prevents fetch', async () => {
  await expectNoFetch({ accountId: 'test-account', positivePrompt: 'cat' }, 'CREDENTIALS_MISSING');
});

test('empty prompt prevents fetch', async () => {
  await expectNoFetch({ accountId: 'test-account', apiToken: 'test-token', positivePrompt: '  ' }, 'PROMPT_REQUIRED');
});

test('request uses the Cloudflare endpoint and multipart fields', async () => {
  let captured;
  await CloudflareAI.requestImage({
    accountId: 'test-account',
    apiToken: 'test-token',
    positivePrompt: 'red stopwatch',
    negativePrompt: 'text',
    fetchImpl: async (url, init) => {
      captured = { url, init };
      return successResponse();
    }
  });

  assert.equal(captured.url, 'https://api.cloudflare.com/client/v4/accounts/test-account/ai/run/@cf/black-forest-labs/flux-2-klein-4b');
  assert.equal(captured.init.method, 'POST');
  assert.equal(captured.init.headers.Authorization, 'Bearer test-token');
  assert.equal(Object.hasOwn(captured.init.headers, 'Content-Type'), false);
  assert.ok(captured.init.body instanceof FormData);
  assert.equal(captured.init.body.get('prompt'), 'red stopwatch\n\nAvoid: text');
  assert.equal(captured.init.body.get('width'), '512');
  assert.equal(captured.init.body.get('height'), '512');
});

function successResponse(image = 'ZmFrZS1pbWFnZQ==') {
  return new Response(JSON.stringify({ success: true, result: { image } }), {
    status: 200,
    headers: { 'content-type': 'application/json' }
  });
}

test('successful Base64 output becomes an image data URL', async () => {
  const image = await CloudflareAI.requestImage({
    accountId: 'test-account',
    apiToken: 'test-token',
    positivePrompt: 'cat',
    fetchImpl: async () => successResponse()
  });
  assert.match(image, /^data:image\/[a-z+.-]+;base64,ZmFrZS1pbWFnZQ==$/);
});

test('HTTP 401 returns the authentication message', async () => {
  await assert.rejects(
    CloudflareAI.requestImage({
      accountId: 'test-account', apiToken: 'test-token', positivePrompt: 'cat',
      fetchImpl: async () => new Response('{}', { status: 401 })
    }),
    (error) => error.userMessage === CloudflareAI.USER_MESSAGES.authentication
  );
});

test('HTTP 429 returns the quota message', async () => {
  await assert.rejects(
    CloudflareAI.requestImage({
      accountId: 'test-account', apiToken: 'test-token', positivePrompt: 'cat',
      fetchImpl: async () => new Response('{}', { status: 429 })
    }),
    (error) => error.userMessage === CloudflareAI.USER_MESSAGES.quota
  );
});

test('a successful response without an image is rejected cleanly', async () => {
  await assert.rejects(
    CloudflareAI.requestImage({
      accountId: 'test-account', apiToken: 'test-token', positivePrompt: 'cat',
      fetchImpl: async () => new Response(JSON.stringify({ success: true, result: {} }), { status: 200 })
    }),
    (error) => error.userMessage === CloudflareAI.USER_MESSAGES.invalidResponse
  );
});

test('two Stream Deck contexts keep separate prompts and images', async () => {
  let actionInstance;
  class ActionMock {
    constructor() { actionInstance = this; }
    onWillAppear(fn) { this.willAppear = fn; }
    onDidReceiveSettings(fn) { this.didReceiveSettings = fn; }
    onSendToPlugin(fn) { this.sendToPlugin = fn; }
    onKeyUp(fn) { this.keyUp = fn; }
    onDialUp(fn) { this.dialUp = fn; }
    onTouchTap(fn) { this.touchTap = fn; }
  }

  const saved = new Map();
  const displayed = new Map();
  let globalSettingsHandler;
  const streamDeck = {
    onConnected(fn) { this.connected = fn; },
    onDidReceiveGlobalSettings(fn) { globalSettingsHandler = fn; },
    getGlobalSettings() {
      queueMicrotask(() => globalSettingsHandler({ payload: { settings: {
        cloudflareAccountId: 'test-account', cloudflareApiToken: 'test-token'
      } } }));
    },
    setImage(context, image) { displayed.set(context, image); },
    setSettings(context, settings) { saved.set(context, settings); },
    sendToPropertyInspector() {},
    showOk() {},
    showAlert() {}
  };
  const cloudflareAI = {
    USER_MESSAGES: CloudflareAI.USER_MESSAGES,
    async requestImage(options) {
      return `data:image/jpeg;base64,${Buffer.from(options.positivePrompt).toString('base64')}`;
    }
  };
  const runtime = createPluginRuntime({ streamDeck, ActionClass: ActionMock, cloudflareAI, logger: { error() {} } });
  actionInstance.willAppear({ context: 'button-1', payload: { settings: { positivePrompt: 'red stopwatch' } } });
  actionInstance.willAppear({ context: 'button-2', payload: { settings: { positivePrompt: 'blue computer' } } });

  await Promise.all([
    runtime.generateForContext('button-1'),
    runtime.generateForContext('button-2')
  ]);

  assert.equal(saved.get('button-1').positivePrompt, 'red stopwatch');
  assert.equal(saved.get('button-2').positivePrompt, 'blue computer');
  assert.notEqual(saved.get('button-1').lastImage, saved.get('button-2').lastImage);
  assert.equal(displayed.get('button-1'), saved.get('button-1').lastImage);
  assert.equal(displayed.get('button-2'), saved.get('button-2').lastImage);
});
