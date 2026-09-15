const test = require('node:test');
const assert = require('node:assert/strict');

const CloudflareAI = require('../src/com.f00d4tehg0dz.aipaints.sdPlugin/cloudflare-ai.js');
const { createPluginRuntime } = require('../src/com.f00d4tehg0dz.aipaints.sdPlugin/app.js');

function createActionMock() {
  let instance;
  class ActionMock {
    constructor() { instance = this; }
    onWillAppear(fn) { this.willAppear = fn; }
    onDidReceiveSettings(fn) { this.didReceiveSettings = fn; }
    onSendToPlugin(fn) { this.sendToPlugin = fn; }
    onKeyUp(fn) { this.keyUp = fn; }
    onDialUp(fn) { this.dialUp = fn; }
    onTouchTap(fn) { this.touchTap = fn; }
  }
  return { ActionMock, getInstance: () => instance };
}

function createStreamDeckMock() {
  let globalSettingsHandler;
  let globalSettingsRequests = 0;
  const inspectorUpdates = [];
  let alertCount = 0;

  const streamDeck = {
    onConnected(fn) { this.connected = fn; },
    onDidReceiveGlobalSettings(fn) { globalSettingsHandler = fn; },
    getGlobalSettings() {
      globalSettingsRequests += 1;
      queueMicrotask(() => globalSettingsHandler({ payload: { settings: {
        cloudflareAccountId: 'test-account',
        cloudflareApiToken: 'test-token'
      } } }));
    },
    setImage() {},
    setSettings() {},
    sendToPropertyInspector(context, payload) {
      inspectorUpdates.push({ context, payload });
    },
    showOk() {},
    showAlert() { alertCount += 1; }
  };

  return {
    streamDeck,
    inspectorUpdates,
    getGlobalSettingsRequests: () => globalSettingsRequests,
    getAlertCount: () => alertCount
  };
}

test('cached global credentials are reused across physical key generations', async () => {
  const action = createActionMock();
  const deck = createStreamDeckMock();
  let requestCount = 0;

  const cloudflareAI = {
    USER_MESSAGES: CloudflareAI.USER_MESSAGES,
    async requestImage(options) {
      requestCount += 1;
      assert.equal(options.accountId, 'test-account');
      assert.equal(options.apiToken, 'test-token');
      return 'data:image/jpeg;base64,ZmFrZQ==';
    }
  };

  const runtime = createPluginRuntime({
    streamDeck: deck.streamDeck,
    ActionClass: action.ActionMock,
    cloudflareAI,
    logger: { error() {} }
  });

  deck.streamDeck.connected();
  await new Promise((resolve) => setImmediate(resolve));

  const actionInstance = action.getInstance();
  actionInstance.willAppear({
    context: 'button-1',
    payload: { settings: { positivePrompt: 'red stopwatch' } }
  });

  await runtime.generateForContext('button-1');
  await runtime.generateForContext('button-1');

  assert.equal(requestCount, 2);
  assert.equal(deck.getGlobalSettingsRequests(), 1);
});

test('generation failures send safe structured details to the Property Inspector', async () => {
  const action = createActionMock();
  const deck = createStreamDeckMock();

  const cloudflareAI = {
    USER_MESSAGES: CloudflareAI.USER_MESSAGES,
    async requestImage() {
      const error = new Error('Cloudflare image generation failed.');
      error.code = 'HTTP_ERROR';
      error.status = 503;
      error.userMessage = 'Cloudflare image generation failed.';
      throw error;
    }
  };

  const runtime = createPluginRuntime({
    streamDeck: deck.streamDeck,
    ActionClass: action.ActionMock,
    cloudflareAI,
    logger: { error() {} }
  });

  deck.streamDeck.connected();
  await new Promise((resolve) => setImmediate(resolve));

  action.getInstance().willAppear({
    context: 'button-1',
    payload: { settings: { positivePrompt: 'red stopwatch' } }
  });

  const result = await runtime.generateForContext('button-1');
  const lastUpdate = deck.inspectorUpdates.at(-1);

  assert.equal(result, null);
  assert.equal(deck.getAlertCount(), 1);
  assert.equal(lastUpdate.context, 'button-1');
  assert.equal(lastUpdate.payload.status, 'Cloudflare image generation failed.');
  assert.deepEqual(lastUpdate.payload.details, {
    code: 'HTTP_ERROR',
    httpStatus: 503,
    message: 'Cloudflare image generation failed.'
  });
  assert.equal(Object.hasOwn(lastUpdate.payload.details, 'apiToken'), false);
  assert.equal(Object.hasOwn(lastUpdate.payload.details, 'accountId'), false);
});
