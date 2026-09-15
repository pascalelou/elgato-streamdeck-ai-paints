import { normalizeActionSettings, normalizeGlobalSettings } from "../settings/normalize";
import type { ActionSettings, GenerationUpdate, GlobalSettings } from "../settings/types";

const ACTION_UUID = "com.f00d4tehg0dz.aipaints.action";
const COMMUNICATION_TIMEOUT_MS = 125_000;

let socket: WebSocket | undefined;
let context = "";
let actionSettings: ActionSettings = normalizeActionSettings({});
let generationTimeout: ReturnType<typeof setTimeout> | undefined;

function byId<T extends HTMLElement>(id: string): T {
  const value = document.getElementById(id);
  if (!value) throw new Error(`Missing element ${id}`);
  return value as T;
}

function send(event: string, payload?: unknown, action?: string): void {
  if (!socket || socket.readyState !== WebSocket.OPEN) return;
  socket.send(JSON.stringify({ event, context, ...(action ? { action } : {}), ...(payload === undefined ? {} : { payload }) }));
}

function setStatus(message = "", details?: GenerationUpdate["details"]): void {
  const lines = [message];
  if (details?.code) lines.push(`Code: ${details.code}`);
  if (details?.httpStatus) lines.push(`HTTP: ${details.httpStatus}`);
  const status = byId<HTMLElement>("currentText");
  status.textContent = lines.filter(Boolean).join("\n");
  status.hidden = !status.textContent;
}

function setGenerating(generating: boolean): void {
  byId<HTMLButtonElement>("generate").disabled = generating;
  if (generationTimeout) clearTimeout(generationTimeout);
  if (generating) {
    generationTimeout = setTimeout(() => {
      setGenerating(false);
      setStatus("Property Inspector communication timed out.");
    }, COMMUNICATION_TIMEOUT_MS);
  }
}

function showImage(image: string): void {
  if (!image) return;
  const preview = byId<HTMLImageElement>("currentImage");
  const view = byId<HTMLButtonElement>("viewImage");
  preview.src = image;
  preview.hidden = false;
  view.hidden = false;
  view.onclick = () => window.open(`popup.html?image=${encodeURIComponent(image)}`, "GeneratedImage", "width=960,height=720,resizable=yes,scrollbars=yes");
}

function setFormSettings(settings: unknown): void {
  actionSettings = normalizeActionSettings(settings);
  byId<HTMLInputElement>("positivePrompt").value = actionSettings.positivePrompt;
  byId<HTMLInputElement>("negativePrompt").value = actionSettings.negativePrompt;
  showImage(actionSettings.lastImage);
}

function setCredentials(settings: unknown): void {
  const credentials = normalizeGlobalSettings(settings);
  byId<HTMLInputElement>("cloudflareAccountId").value = credentials.cloudflareAccountId;
  byId<HTMLInputElement>("cloudflareApiToken").value = credentials.cloudflareApiToken;
}

function readCredentials(): GlobalSettings {
  return normalizeGlobalSettings({
    cloudflareAccountId: byId<HTMLInputElement>("cloudflareAccountId").value,
    cloudflareApiToken: byId<HTMLInputElement>("cloudflareApiToken").value
  });
}

function saveCredentials(): void {
  send("setGlobalSettings", readCredentials());
}

window.connectElgatoStreamDeckSocket = (port: string, uuid: string, registerEvent: string, _info: string, actionInfo: string) => {
  context = uuid;
  const info = JSON.parse(actionInfo) as { payload?: { settings?: unknown } };
  setFormSettings(info.payload?.settings);
  socket = new WebSocket(`ws://127.0.0.1:${port}`);
  socket.onopen = () => {
    socket?.send(JSON.stringify({ event: registerEvent, uuid: context }));
    send("getGlobalSettings");
  };
  socket.onmessage = (event: MessageEvent<string>) => {
    const message = JSON.parse(event.data) as { event?: string; payload?: { settings?: unknown } | GenerationUpdate };
    if (message.event === "didReceiveGlobalSettings") {
      setCredentials((message.payload as { settings?: unknown })?.settings);
      return;
    }
    if (message.event !== "sendToPropertyInspector") return;
    const update = message.payload as GenerationUpdate;
    if (update.type !== "generationUpdate") return;
    setGenerating(update.state === "generating");
    setStatus(update.status, update.details);
    if (update.image) {
      actionSettings.lastImage = update.image;
      showImage(update.image);
    }
  };
};

declare global {
  interface Window {
    connectElgatoStreamDeckSocket: (port: string, uuid: string, registerEvent: string, info: string, actionInfo: string) => void;
  }
}

document.addEventListener("DOMContentLoaded", () => {
  byId<HTMLInputElement>("cloudflareAccountId").addEventListener("change", saveCredentials);
  byId<HTMLInputElement>("cloudflareApiToken").addEventListener("change", saveCredentials);
  byId<HTMLButtonElement>("github").addEventListener("click", () => send("openUrl", { url: "https://github.com/pascalelou/Stream-Deck-AI-Plugin" }));
  byId<HTMLButtonElement>("generate").addEventListener("click", () => {
    const credentials = readCredentials();
    const positivePrompt = byId<HTMLInputElement>("positivePrompt").value.trim();
    const negativePrompt = byId<HTMLInputElement>("negativePrompt").value.trim();
    if (!credentials.cloudflareAccountId || !credentials.cloudflareApiToken) return setStatus("Cloudflare credentials missing.");
    if (!positivePrompt) return setStatus("Prompt is required.");

    actionSettings = { ...actionSettings, positivePrompt, negativePrompt };
    send("setSettings", actionSettings);
    send("setGlobalSettings", credentials);
    send("sendToPlugin", { type: "generate", positivePrompt, negativePrompt }, ACTION_UUID);
    setGenerating(true);
    setStatus("Generating image...");
  });
});
