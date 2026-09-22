export type GenerationMode = "prompt" | "variation" | "random-ai";

export type RandomCategory =
  | "everything"
  | "landscape"
  | "animals"
  | "sci-fi"
  | "fantasy"
  | "architecture"
  | "abstract"
  | "cute"
  | "dark"
  | "surreal";

export type ActionSettings = {
  positivePrompt: string;
  negativePrompt: string;
  lastImage: string;
  mode: GenerationMode;
  randomCategory: RandomCategory;
  lastResolvedPrompt: string;
  lastPromptSeed: number | null;
  lastImageSeed: number | null;
};

export type LegacyActionSettings = Partial<ActionSettings> & {
  positive?: unknown;
  negative?: unknown;
  base64Image?: unknown;
  positivePrompt?: unknown;
  negativePrompt?: unknown;
  lastImage?: unknown;
  mode?: unknown;
  randomCategory?: unknown;
  lastResolvedPrompt?: unknown;
  lastPromptSeed?: unknown;
  lastImageSeed?: unknown;
};

export type GlobalSettings = {
  cloudflareAccountId: string;
  cloudflareApiToken: string;
};

export type Credentials = {
  accountId: string;
  apiToken: string;
};

export type GenerationState = "idle" | "generating" | "success" | "error";

export type GenerationUpdate = {
  type: "generationUpdate";
  state: GenerationState;
  status: string;
  image: string | null;
  settings?: ActionSettings;
  details: {
    code: string;
    httpStatus: number | null;
    message: string;
  } | null;
};
