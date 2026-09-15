(function (root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  if (root) root.CloudflareAI = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';

  const MODEL = '@cf/black-forest-labs/flux-2-klein-4b';
  const IMAGE_WIDTH = 512;
  const IMAGE_HEIGHT = 512;
  const USER_MESSAGES = Object.freeze({
    credentials: 'Cloudflare credentials missing.',
    prompt: 'Prompt is required.',
    authentication: 'Cloudflare authentication failed. Check Account ID and API Token.',
    quota: 'Cloudflare Workers AI quota or rate limit reached.',
    network: 'Unable to reach Cloudflare Workers AI.',
    invalidResponse: 'Cloudflare returned no image.',
    generic: 'Cloudflare image generation failed.'
  });

  class CloudflareImageError extends Error {
    constructor(code, userMessage, status) {
      super(userMessage);
      this.name = 'CloudflareImageError';
      this.code = code;
      this.userMessage = userMessage;
      this.status = status || null;
    }
  }

  function buildPrompt(positivePrompt, negativePrompt) {
    const positive = String(positivePrompt || '').trim();
    const negative = String(negativePrompt || '').trim();
    if (!positive) throw new CloudflareImageError('PROMPT_REQUIRED', USER_MESSAGES.prompt);
    return negative ? `${positive}\n\nAvoid: ${negative}` : positive;
  }

  function detectMimeType(base64Image) {
    if (base64Image.startsWith('iVBORw0KGgo')) return 'image/png';
    if (base64Image.startsWith('/9j/')) return 'image/jpeg';
    if (base64Image.startsWith('R0lGOD')) return 'image/gif';
    if (base64Image.startsWith('UklGR')) return 'image/webp';
    return 'image/jpeg';
  }

  function toImageDataUrl(image) {
    const value = String(image || '').trim();
    if (!value) throw new CloudflareImageError('INVALID_RESPONSE', USER_MESSAGES.invalidResponse);
    if (/^data:image\/[a-z0-9.+-]+(?:;charset=[^;,]+)?;base64,/i.test(value)) return value;
    try {
      if (typeof atob === 'function') atob(value);
    } catch (_error) {
      throw new CloudflareImageError('INVALID_RESPONSE', USER_MESSAGES.invalidResponse);
    }
    return `data:${detectMimeType(value)};base64,${value}`;
  }

  function errorTextFromPayload(payload) {
    if (!payload || typeof payload !== 'object') return '';
    const parts = [];
    const values = Array.isArray(payload.errors) ? payload.errors : [];
    for (const item of values) {
      if (typeof item === 'string') parts.push(item);
      if (item && typeof item.message === 'string') parts.push(item.message);
    }
    if (typeof payload.message === 'string') parts.push(payload.message);
    return parts.join(' ');
  }

  async function readJsonSafely(response) {
    try { return await response.json(); } catch (_error) { return null; }
  }

  async function requestImage(options) {
    const accountId = String(options && options.accountId || '').trim();
    const apiToken = String(options && options.apiToken || '').trim();
    const fetchImpl = options && options.fetchImpl || (typeof fetch === 'function' ? fetch.bind(globalThis) : null);
    const FormDataImpl = options && options.FormDataImpl || (typeof FormData === 'function' ? FormData : null);
    if (!accountId || !apiToken) {
      throw new CloudflareImageError('CREDENTIALS_MISSING', USER_MESSAGES.credentials);
    }
    const prompt = buildPrompt(options.positivePrompt, options.negativePrompt);
    if (!fetchImpl || !FormDataImpl) throw new CloudflareImageError('NETWORK_ERROR', USER_MESSAGES.network);

    const formData = new FormDataImpl();
    formData.append('prompt', prompt);
    formData.append('width', String(IMAGE_WIDTH));
    formData.append('height', String(IMAGE_HEIGHT));
    const url = `https://api.cloudflare.com/client/v4/accounts/${encodeURIComponent(accountId)}/ai/run/${MODEL}`;

    let response;
    try {
      response = await fetchImpl(url, {
        method: 'POST',
        headers: { Authorization: `Bearer ${apiToken}` },
        body: formData
      });
    } catch (_error) {
      throw new CloudflareImageError('NETWORK_ERROR', USER_MESSAGES.network);
    }

    const data = await readJsonSafely(response);
    const apiErrorText = errorTextFromPayload(data);
    if (!response.ok) {
      if (response.status === 401 || response.status === 403) {
        throw new CloudflareImageError('AUTHENTICATION_FAILED', USER_MESSAGES.authentication, response.status);
      }
      if (response.status === 429 || /quota|rate[ -]?limit|limit reached|limit exceeded/i.test(apiErrorText)) {
        throw new CloudflareImageError('QUOTA_REACHED', USER_MESSAGES.quota, response.status);
      }
      throw new CloudflareImageError('HTTP_ERROR', USER_MESSAGES.generic, response.status);
    }
    if (!data || data.success !== true || !data.result || typeof data.result.image !== 'string') {
      if (/quota|rate[ -]?limit|limit reached|limit exceeded/i.test(apiErrorText)) {
        throw new CloudflareImageError('QUOTA_REACHED', USER_MESSAGES.quota, response.status);
      }
      throw new CloudflareImageError('INVALID_RESPONSE', USER_MESSAGES.invalidResponse, response.status);
    }
    return toImageDataUrl(data.result.image);
  }

  return { MODEL, IMAGE_WIDTH, IMAGE_HEIGHT, USER_MESSAGES, CloudflareImageError, buildPrompt, toImageDataUrl, requestImage };
});
