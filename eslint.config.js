import js from "@eslint/js";
import tseslint from "typescript-eslint";

export default tseslint.config(
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    files: ["**/*.ts"],
    languageOptions: {
      globals: {
        AbortController: "readonly",
        Blob: "readonly",
        document: "readonly",
        Event: "readonly",
        fetch: "readonly",
        FormData: "readonly",
        HTMLElement: "readonly",
        HTMLButtonElement: "readonly",
        HTMLImageElement: "readonly",
        HTMLInputElement: "readonly",
        MessageEvent: "readonly",
        queueMicrotask: "readonly",
        Response: "readonly",
        setTimeout: "readonly",
        clearTimeout: "readonly",
        WebSocket: "readonly",
        window: "readonly"
      }
    }
  },
  { ignores: ["node_modules/**", "Release/**", "src/**/*.sdPlugin/bin/**", "src/**/*.sdPlugin/ui/*.js"] }
);
