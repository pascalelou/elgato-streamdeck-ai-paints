# AI Paints for Stream Deck

AI Paints generates a new image from a prompt when you click **Generate** in the Property Inspector or press its Stream Deck key. Version 1.1 calls Cloudflare Workers AI directly—no local service or intermediary image-generation server is required.

The fixed model is `@cf/black-forest-labs/flux-2-klein-4b`, and images are generated at 512 × 512 pixels.

## Installation

Download the plugin package from the `Release` folder, then double-click it to install it in Stream Deck. Restart or reload Stream Deck after replacing an existing installation.

## Cloudflare Workers AI setup

1. Sign in to the [Cloudflare dashboard](https://dash.cloudflare.com/).
2. Open **Workers AI**, then choose **Use REST API**.
3. Copy your **Account ID**.
4. Create a token with Cloudflare's **Workers AI API Token** template. For a custom token, Cloudflare's current REST API guide requires only **Workers AI - Read** and **Workers AI - Edit**; scope both permissions to the relevant account.
5. Add AI Paints to a Stream Deck key and open its Property Inspector.
6. Enter the Account ID and token. These credentials are stored in Stream Deck Global Settings and shared by all AI Paints keys.
7. Enter a prompt, optionally enter content to avoid, and click **Generate**.

Each key keeps its own prompts and last generated image in its action settings. After Stream Deck restarts, AI Paints restores that image without making a new API request. Pressing the key generates a fresh image.

AI Paints requires no local infrastructure and generates images directly through the Cloudflare Workers AI REST API. Credentials are never placed in per-key settings or application logs.

## Development

The plugin retains the bundled legacy JavaScript Stream Deck SDK used by the original project. The source plugin is in `src/com.f00d4tehg0dz.aipaints.sdPlugin`.

Run the dependency-free test suite with:

```sh
npm test
```

## Changelog

### 1.1.1

- Cache Cloudflare credentials in the plugin runtime so physical key presses do not depend on a fresh Global Settings round-trip each time.
- Increase the Global Settings fallback timeout from 3 seconds to 10 seconds.
- Surface structured generation errors in the Property Inspector, including the plugin error code, HTTP status when available, and a safe error message.
- Keep Cloudflare credentials out of diagnostics.

### 1.1.0

Replace deprecated Hugging Face/f00d.me image generation backend with Cloudflare Workers AI using FLUX.2 Klein 4B. These former services are mentioned here only to document the migration; the plugin contains no code that contacts them.
