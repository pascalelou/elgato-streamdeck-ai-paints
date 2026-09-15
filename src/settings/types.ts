export type ActionSettings = {
  positivePrompt: string;
  negativePrompt: string;
  lastImage: string;
};

export type LegacyActionSettings = Partial<ActionSettings> & {
  positive?: unknown;
  negative?: unknown;
  base64Image?: unknown;
  positivePrompt?: unknown;
  negativePrompt?: unknown;
  lastImage?: unknown;
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
  details: {
    code: string;
    httpStatus: number | null;
    message: string;
  } | null;
};
