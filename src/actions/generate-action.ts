import streamDeck, {
  action,
  type DialUpEvent,
  type DidReceiveSettingsEvent,
  type KeyUpEvent,
  type SendToPluginEvent,
  SingletonAction,
  type TouchTapEvent,
  type WillAppearEvent
} from "@elgato/streamdeck";
import type { JsonValue } from "@elgato/utils";

import { CloudflareImageService, type GenerateImageOptions } from "../services/cloudflare-ai";
import { CloudflareTextPromptService, type GeneratePromptOptions, type GeneratedPromptResult } from "../services/cloudflare-text";
import { normalizeActionSettings, normalizeGlobalSettings, toCredentials } from "../settings/normalize";
import type { ActionSettings, Credentials, GenerationState, GenerationUpdate, GlobalSettings } from "../settings/types";
import { AppError, toAppError } from "../utils/errors";
import { createLogger, type Logger } from "../utils/logging";

export const ACTION_UUID = "com.f00d4tehg0dz.aipaints.action";
export const SETTINGS_TIMEOUT_MS = 10_000;
export const GENERATION_TIMEOUT_MS = 120_000;

type ImageService = { generateImage(options: GenerateImageOptions): Promise<string> };
type TextPromptService = { generatePrompt(options: GeneratePromptOptions): Promise<GeneratedPromptResult> };
type ActionHandle = WillAppearEvent<ActionSettings>["action"];

type GenerateActionOptions = {
  imageService?: ImageService;
  textPromptService?: TextPromptService;
  getGlobalSettings?: () => Promise<GlobalSettings>;
  sendToPropertyInspector?: (actionId: string, update: GenerationUpdate) => Promise<void>;
  settingsTimeoutMs?: number;
  generationTimeoutMs?: number;
  logger?: Logger;
  randomSeed?: () => number;
};

type GenerateMessage = { type?: unknown; positivePrompt?: unknown; negativePrompt?: unknown; mode?: unknown; randomCategory?: unknown };

type ResolvedGeneration = { finalPrompt: string; imageSeed: number | null; promptSeed: number | null };

@action({ UUID: ACTION_UUID })
export class GenerateAction extends SingletonAction<ActionSettings> {
  private readonly imageService: ImageService;
  private readonly textPromptService: TextPromptService;
  private readonly getGlobalSettings: () => Promise<GlobalSettings>;
  private readonly sendToPropertyInspector: (actionId: string, update: GenerationUpdate) => Promise<void>;
  private readonly settingsTimeoutMs: number;
  private readonly generationTimeoutMs: number;
  private readonly logger: Logger;
  private readonly createRandomSeed: () => number;
  private readonly states = new Map<string, GenerationState>();
  private readonly settingsByContext = new Map<string, ActionSettings>();

  constructor(options: GenerateActionOptions = {}) {
    super();
    this.imageService = options.imageService ?? new CloudflareImageService();
    this.textPromptService = options.textPromptService ?? new CloudflareTextPromptService();
    this.getGlobalSettings = options.getGlobalSettings ?? (() => streamDeck.settings.getGlobalSettings<GlobalSettings>());
    this.sendToPropertyInspector = options.sendToPropertyInspector ?? (async (actionId, update) => {
      if (streamDeck.ui.action?.id === actionId) await streamDeck.ui.sendToPropertyInspector(update);
    });
    this.settingsTimeoutMs = options.settingsTimeoutMs ?? SETTINGS_TIMEOUT_MS;
    this.generationTimeoutMs = options.generationTimeoutMs ?? GENERATION_TIMEOUT_MS;
    this.logger = options.logger ?? createLogger("GenerateAction");
    this.createRandomSeed = options.randomSeed ?? randomSeed;
  }

  override async onWillAppear(ev: WillAppearEvent<ActionSettings>): Promise<void> {
    await this.restore(ev.action, ev.payload.settings);
  }

  override async onDidReceiveSettings(ev: DidReceiveSettingsEvent<ActionSettings>): Promise<void> {
    await this.restore(ev.action, ev.payload.settings);
  }

  override async onKeyUp(ev: KeyUpEvent<ActionSettings>): Promise<void> {
    await this.generateForAction(ev.action, ev.payload.settings);
  }

  override async onDialUp(ev: DialUpEvent<ActionSettings>): Promise<void> {
    await this.generateForAction(ev.action, ev.payload.settings);
  }

  override async onTouchTap(ev: TouchTapEvent<ActionSettings>): Promise<void> {
    await this.generateForAction(ev.action, ev.payload.settings);
  }

  override async onSendToPlugin(ev: SendToPluginEvent<JsonValue, ActionSettings>): Promise<void> {
    const payload = ev.payload && typeof ev.payload === "object" ? (ev.payload as GenerateMessage) : {};
    if (payload.type !== "generate") return;
    const current = normalizeActionSettings(ev.action.getSettings ? await ev.action.getSettings() : {});
    const incoming = normalizeActionSettings({
      ...current,
      ...(Object.hasOwn(payload, "positivePrompt") ? { positivePrompt: payload.positivePrompt } : {}),
      ...(Object.hasOwn(payload, "negativePrompt") ? { negativePrompt: payload.negativePrompt } : {}),
      ...(Object.hasOwn(payload, "mode") ? { mode: payload.mode } : {}),
      ...(Object.hasOwn(payload, "randomCategory") ? { randomCategory: payload.randomCategory } : {})
    });
    await ev.action.setSettings(incoming);
    await this.generateForAction(ev.action, incoming);
  }

  getState(actionId: string): GenerationState {
    return this.states.get(actionId) ?? "idle";
  }

  async generateForAction(actionHandle: ActionHandle, rawSettings?: unknown): Promise<string | null> {
    const actionId = actionHandle.id;
    if (this.getState(actionId) === "generating") {
      this.logger.debug("Duplicate generation ignored", { actionId });
      return null;
    }

    const settings = normalizeActionSettings(rawSettings ?? this.settingsByContext.get(actionId));
    this.settingsByContext.set(actionId, settings);
    this.states.set(actionId, "generating");
    await this.notify(actionId, "generating", settings.mode === "random-ai" ? "Generating random prompt..." : "Generating image...");
    this.logger.info("Generation started", { actionId, mode: settings.mode });

    const generationController = new AbortController();
    const timeout = setTimeout(() => generationController.abort(), this.generationTimeoutMs);
    try {
      const globalSettings = normalizeGlobalSettings(
        await withTimeout(this.getGlobalSettings(), this.settingsTimeoutMs, "SETTINGS_TIMEOUT")
      );
      const credentials = toCredentials(globalSettings);
      const resolved = await this.resolveGeneration(settings, credentials, generationController.signal);
      this.logger.info("Image request started", { actionId, mode: settings.mode, seeded: resolved.imageSeed !== null });
      const image = await this.imageService.generateImage({
        prompt: resolved.finalPrompt,
        negativePrompt: settings.negativePrompt,
        credentials,
        signal: generationController.signal,
        ...(resolved.imageSeed === null ? {} : { seed: resolved.imageSeed })
      });
      if (generationController.signal.aborted) {
        throw new AppError("GENERATION_TIMEOUT", "Cloudflare image generation timed out.");
      }

      const updated = {
        ...settings,
        lastImage: image,
        lastResolvedPrompt: resolved.finalPrompt,
        lastPromptSeed: resolved.promptSeed,
        lastImageSeed: resolved.imageSeed
      };
      this.settingsByContext.set(actionId, updated);
      await actionHandle.setImage(image);
      await actionHandle.setSettings(updated);
      this.states.set(actionId, "success");
      await this.notify(actionId, "success", "Image generated successfully.", image, undefined, updated);
      if (actionHandle.isKey()) await actionHandle.showOk();
      this.logger.info("Stream Deck image updated", { actionId });
      return image;
    } catch (error) {
      const normalized = generationController.signal.aborted
        ? new AppError("GENERATION_TIMEOUT", "Cloudflare image generation timed out.")
        : toAppError(error);
      this.states.set(actionId, "error");
      this.logger.error("Generation failed", normalized);
      await this.notify(actionId, "error", normalized.userMessage, null, normalized);
      await actionHandle.showAlert();
      return null;
    } finally {
      clearTimeout(timeout);
    }
  }

  private async resolveGeneration(settings: ActionSettings, credentials: Credentials, signal: AbortSignal): Promise<ResolvedGeneration> {
    this.logger.debug("Mode resolved", { mode: settings.mode });
    if (settings.mode === "prompt") return { finalPrompt: settings.positivePrompt, imageSeed: null, promptSeed: null };
    if (settings.mode === "variation") {
      return { finalPrompt: settings.positivePrompt, imageSeed: this.createRandomSeed(), promptSeed: null };
    }

    const promptSeed = this.createRandomSeed();
    const generated = await this.textPromptService.generatePrompt({
      category: settings.randomCategory,
      userPrompt: settings.positivePrompt,
      negativePrompt: settings.negativePrompt,
      credentials,
      signal,
      seed: promptSeed
    });
    return { finalPrompt: generated.prompt, promptSeed: generated.seed, imageSeed: this.createRandomSeed() };
  }

  private async restore(actionHandle: ActionHandle, rawSettings: unknown): Promise<void> {
    const settings = normalizeActionSettings(rawSettings);
    this.settingsByContext.set(actionHandle.id, settings);
    this.states.set(actionHandle.id, "idle");
    if (settings.lastImage) await actionHandle.setImage(settings.lastImage);
  }

  private async notify(
    actionId: string,
    state: GenerationState,
    status: string,
    image: string | null = null,
    error?: AppError,
    settings?: ActionSettings
  ): Promise<void> {
    await this.sendToPropertyInspector(actionId, {
      type: "generationUpdate",
      state,
      status,
      image,
      ...(settings ? { settings } : {}),
      details: error ? { code: error.code, httpStatus: error.status, message: error.userMessage } : null
    });
  }
}

export function randomSeed(): number {
  const values = new Uint32Array(1);
  crypto.getRandomValues(values);
  return ((values[0] ?? 0) % 0x7fffffff) + 1;
}

async function withTimeout<T>(promise: Promise<T>, timeoutMs: number, code: string): Promise<T> {
  let timeout: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race([
      promise,
      new Promise<never>((_resolve, reject) => {
        timeout = setTimeout(() => reject(new AppError(code, "Unable to read Stream Deck settings.")), timeoutMs);
      })
    ]);
  } finally {
    if (timeout) clearTimeout(timeout);
  }
}
