# AI Paints for Stream Deck

AI Paints generates a new image from a prompt when you click **Generate** in the Property Inspector or press its Stream Deck key. Version 2 uses Elgato's modern TypeScript/Node.js SDK and calls Cloudflare Workers AI directly—no local service or intermediary image-generation server is required.

The fixed model is `@cf/black-forest-labs/flux-2-klein-4b`, and images are generated at 512 × 512 pixels.

## Installation

Download the plugin package from the `Release` folder, then double-click it to install it in Stream Deck. Version 2 requires Stream Deck 7.1 or newer. Installing it over V1 preserves existing action UUIDs, prompts, shared credentials, and last generated images.

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

The TypeScript source is under `src/`; Rollup produces the Node.js backend in `src/com.f00d4tehg0dz.aipaints.sdPlugin/bin` and the Property Inspector bundle in `src/com.f00d4tehg0dz.aipaints.sdPlugin/ui`. The legacy browser SDK is no longer used.

Development, testing, and packaging require Node.js 24 or newer. The plugin uses `@elgato/streamdeck` 2.x, Stream Deck SDK 3, and the official Stream Deck CLI.

Install the pinned development tooling and run the full validation suite with:

```sh
npm ci
npm run check
npm run pack
```

## Changelog

### 2.0.0-alpha.1

- Replace the legacy HTML/JavaScript runtime with a TypeScript Node.js backend and `@elgato/streamdeck`.
- Add a typed `GenerateAction` for keys, dials, touch taps, settings updates, and Property Inspector messages.
- Isolate Cloudflare image generation behind a testable service with abortable network and generation timeouts.
- Preserve V1 action settings (`positive`, `negative`, `base64Image`) and Global Settings credentials.
- Add explicit per-action generation states and reject duplicate requests for the same action.
- Replace `$PI` with a standalone modern WebSocket Property Inspector while retaining the existing workflow.
- Add sanitized structured logging and comprehensive TypeScript tests.
- Move packaging and CI to typecheck, lint, test, build, validate, and pack stages.

### 1.1.3

- Modernize the Stream Deck plugin build and packaging process.
- Replace the legacy DistributionTool with the official Stream Deck CLI.
- Add manifest validation during CI builds.
- Update development and GitHub Actions tooling.
- Update project metadata and repository links.
- Make no functional changes to image generation.

### 1.1.2

- Restore the bundled Stream Deck JavaScript SDK files to source control so clean CI builds contain the runtime and Property Inspector dependencies.
- Add packaging asset tests to prevent publishing an incomplete plugin again.

### 1.1.1

- Cache Cloudflare credentials in the plugin runtime so physical key presses do not depend on a fresh Global Settings round-trip each time.
- Increase the Global Settings fallback timeout from 3 seconds to 10 seconds.
- Surface structured generation errors in the Property Inspector, including the plugin error code, HTTP status when available, and a safe error message.
- Keep Cloudflare credentials out of diagnostics.

### 1.1.0

Replace deprecated Hugging Face/f00d.me image generation backend with Cloudflare Workers AI using FLUX.2 Klein 4B. These former services are mentioned here only to document the migration; the plugin contains no code that contacts them.
