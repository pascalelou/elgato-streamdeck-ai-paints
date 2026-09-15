/// <reference path="../../../libs/js/api.js" />
(function (root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  if (typeof $SD !== 'undefined' && typeof Action !== 'undefined' && root && root.CloudflareAI) {
    api.createPluginRuntime({
      streamDeck: $SD,
      ActionClass: Action,
      cloudflareAI: root.CloudflareAI,
      logger: root.console
    });
  }
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';

  const ACTION_UUID = 'com.f00d4tehg0dz.aipaints.action';
  const GLOBAL_SETTINGS_TIMEOUT_MS = 10000;

  function normalizeActionSettings(settings) {
    const value = settings && typeof settings === 'object' ? settings : {};
    return {
      positivePrompt: String(value.positivePrompt || value.positive || '').trim(),
      negativePrompt: String(value.negativePrompt || value.negative || '').trim(),
      lastImage: typeof value.lastImage === 'string'
        ? value.lastImage
        : (typeof value.base64Image === 'string' ? value.base64Image : '')
    };
  }

  function createPluginRuntime(dependencies) {
    const streamDeck = dependencies.streamDeck;
    const action = new dependencies.ActionClass(ACTION_UUID);
    const cloudflareAI = dependencies.cloudflareAI;
    const logger = dependencies.logger || { error() {} };
    const activeGenerations = new Map();
    const settingsByContext = new Map();
    let credentialWaiters = [];
    let cachedCredentials = {
      accountId: '',
      apiToken: ''
    };

    function sendInspectorUpdate(context, status, image, details) {
      streamDeck.sendToPropertyInspector(context, {
        type: 'generationUpdate',
        status,
        image: image || null,
        details: details || null
      }, ACTION_UUID);
    }

    function receiveGlobalSettings(event) {
      const settings = event && event.payload && event.payload.settings || {};
      const credentials = {
        accountId: String(settings.cloudflareAccountId || '').trim(),
        apiToken: String(settings.cloudflareApiToken || '').trim()
      };

      cachedCredentials = credentials;

      const waiters = credentialWaiters;
      credentialWaiters = [];
      waiters.forEach((resolve) => resolve(credentials));
    }

    function getFreshCredentials() {
      if (cachedCredentials.accountId && cachedCredentials.apiToken) {
        return Promise.resolve(cachedCredentials);
      }

      return new Promise((resolve) => {
        let settled = false;
        let timeoutId;
        const finish = (credentials) => {
          if (settled) return;
          settled = true;
          if (timeoutId) clearTimeout(timeoutId);
          resolve(credentials);
        };
        credentialWaiters.push(finish);
        timeoutId = setTimeout(() => finish(cachedCredentials), GLOBAL_SETTINGS_TIMEOUT_MS);
        streamDeck.getGlobalSettings();
      });
    }

    async function generateImageWithCloudflare(context, positivePrompt, negativePrompt, accountId, apiToken) {
      const imageDataUrl = await cloudflareAI.requestImage({
        positivePrompt,
        negativePrompt,
        accountId,
        apiToken
      });
      streamDeck.setImage(context, imageDataUrl);
      return imageDataUrl;
    }

    async function generateForContext(context, incomingSettings) {
      if (!context || activeGenerations.has(context)) return null;

      const current = normalizeActionSettings(incomingSettings || settingsByContext.get(context));
      settingsByContext.set(context, current);
      activeGenerations.set(context, true);
      sendInspectorUpdate(context, 'Generating image...');

      try {
        const credentials = await getFreshCredentials();
        const image = await generateImageWithCloudflare(
          context,
          current.positivePrompt,
          current.negativePrompt,
          credentials.accountId,
          credentials.apiToken
        );
        const updated = { ...current, lastImage: image };
        settingsByContext.set(context, updated);
        streamDeck.setSettings(context, updated);
        sendInspectorUpdate(context, 'Image generated successfully.', image);
        if (typeof streamDeck.showOk === 'function') streamDeck.showOk(context);
        return image;
      } catch (error) {
        const status = error && error.userMessage ? error.userMessage : cloudflareAI.USER_MESSAGES.generic;
        const details = {
          code: error && error.code || 'UNKNOWN',
          httpStatus: error && error.status || null,
          message: error && error.message || String(error)
        };

        logger.error('Cloudflare image generation failed.', details);
        sendInspectorUpdate(context, status, null, details);
        if (typeof streamDeck.showAlert === 'function') streamDeck.showAlert(context);
        return null;
      } finally {
        activeGenerations.delete(context);
      }
    }

    function restoreContext(context, rawSettings) {
      const settings = normalizeActionSettings(rawSettings);
      settingsByContext.set(context, settings);
      if (settings.lastImage) streamDeck.setImage(context, settings.lastImage);
      return settings;
    }

    function handlePress(event) {
      const rawSettings = event && event.payload && event.payload.settings;
      return generateForContext(event.context, rawSettings || settingsByContext.get(event.context));
    }

    streamDeck.onConnected(() => streamDeck.getGlobalSettings());
    streamDeck.onDidReceiveGlobalSettings(receiveGlobalSettings);

    action.onWillAppear((event) => {
      restoreContext(event.context, event.payload && event.payload.settings);
    });
    action.onDidReceiveSettings((event) => {
      restoreContext(event.context, event.payload && event.payload.settings);
    });
    action.onSendToPlugin((event) => {
      const message = event.payload || {};
      if (message.type !== 'generate') return;
      const current = normalizeActionSettings({
        ...settingsByContext.get(event.context),
        positivePrompt: message.positivePrompt,
        negativePrompt: message.negativePrompt
      });
      settingsByContext.set(event.context, current);
      streamDeck.setSettings(event.context, current);
      generateForContext(event.context, current);
    });
    action.onKeyUp(handlePress);
    if (typeof action.onDialUp === 'function') action.onDialUp(handlePress);
    if (typeof action.onTouchTap === 'function') action.onTouchTap(handlePress);

    return {
      activeGenerations,
      settingsByContext,
      generateForContext,
      generateImageWithCloudflare,
      normalizeActionSettings,
      receiveGlobalSettings
    };
  }

  return { ACTION_UUID, normalizeActionSettings, createPluginRuntime };
});
