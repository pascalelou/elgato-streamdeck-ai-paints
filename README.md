# AI Paints for Stream Deck

AI Paints generates a new image from a prompt when you click **Generate** in the Property Inspector or press its Stream Deck key. Version 2 uses Elgato's modern TypeScript/Node.js SDK and calls Cloudflare Workers AI directly—no local service or intermediary image-generation server is required.

The image model is `@cf/black-forest-labs/flux-2-klein-4b`, and images are generated at 512 × 512 pixels. Random AI uses `@cf/meta/llama-3.1-8b-instruct-fast` to create its image prompt first.

## Generation modes

Each AI Paints key has three generation modes:

- **Prompt** — use this when you want full manual control. The text you enter is sent to FLUX.
- **Variation** — use this for multiple versions of the same idea. AI Paints keeps the base prompt and chooses a new image seed for every generation.
- **Random AI** — use this when you want the plugin to invent a fresh prompt before generating the image. You may select a category and enter an optional creative direction; the text model turns that guidance into one concise English image prompt, then FLUX generates the image with a new seed.

The Property Inspector shows the last prompt actually sent to FLUX and its prompt/image seeds. Existing V1 and V2 keys default to **Prompt**, so upgrading does not alter their behavior, prompts, or saved image.

Random AI makes two Workers AI requests instead of one. It can therefore take longer, consumes quota for both text and image inference, and depends on the additional Cloudflare text model being available to the account.

## Installation

Download the latest `.streamDeckPlugin` package from the repository's **Releases** page, then double-click it to install it in Stream Deck. Version 2 requires Stream Deck 7.1 or newer. Installing it over V1 preserves existing action UUIDs, prompts, shared credentials, and last generated images.

## Cloudflare Workers AI setup

1. Sign in to the [Cloudflare dashboard](https://dash.cloudflare.com/).
2. Open **Workers AI**, then choose **Use REST API**.
3. Copy your **Account ID**.
4. Create a token with Cloudflare's **Workers AI API Token** template. For a custom token, Cloudflare's current REST API guide requires only **Workers AI - Read** and **Workers AI - Edit**; scope both permissions to the relevant account.
5. Add AI Paints to a Stream Deck key and open its Property Inspector.
6. Enter the Account ID and token. These credentials are stored in Stream Deck Global Settings and shared by all AI Paints keys.
7. Select a generation mode, enter a prompt or optional Random AI direction, optionally enter content to avoid, and click **Generate**.

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

## Publishing releases

GitHub Releases are published by the **Publish Release** workflow.

1. Update the version in `package.json` and the corresponding numeric version in `manifest.json`.
2. Merge the version change into `main`.
3. Open the repository's **Actions** tab and select **Publish Release**.
4. Select **Run workflow**, enter the version (for example `2.0.0-rc.1`), and choose whether it is a pre-release.
5. The workflow installs dependencies, runs typecheck, lint and tests, builds and validates the plugin, packages the `.streamDeckPlugin`, creates the Git tag and GitHub Release, generates release notes, and uploads the installable plugin as the release asset.

The release is aborted automatically if the requested version does not match the project metadata or if any validation/build step fails.

## Changelog

### 2.1.0

- Add Prompt, Variation, and Random AI generation modes.
- Generate guided random prompts with Cloudflare Workers AI before image generation.
- Preserve and display the resolved prompt and prompt/image seeds in the Property Inspector.
- Preserve compatibility with existing V1 and V2 keys.

### 2.0.0-rc.1

- Prepare the first release candidate for AI Paints V2.
- Finalize repository links and release metadata.
- Keep the modern TypeScript/Node.js Stream Deck SDK architecture unchanged.
- Preserve compatibility with existing V1 keys, prompts, credentials and generated images.
- No new user-facing features compared with 2.0.0-alpha.1.

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
