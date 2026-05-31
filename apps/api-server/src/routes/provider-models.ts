import { Router } from "express";
import { config } from "@ai-content-factory/config";
import type { ProviderModelInfo, ProviderModelsResponse } from "@ai-content-factory/shared-types";
import { ApiError } from "../errors.js";
import type { ProviderSecretReader } from "./provider-keys.js";

type FetchLike = typeof fetch;

interface OpenAIModelRecord {
  created?: unknown;
  id?: unknown;
  owned_by?: unknown;
}

interface OpenAIModelsBody {
  data?: unknown;
}

export interface CreateProviderModelsRouterOptions {
  fetchImpl?: FetchLike | undefined;
  openAiBaseUrl?: string | undefined;
  readSecret?: ProviderSecretReader | undefined;
}

export function createProviderModelsRouter(options: CreateProviderModelsRouterOptions = {}): Router {
  const router = Router();
  const readSecret = options.readSecret ?? ((keyName: string) => process.env[keyName]);
  const fetchImpl = options.fetchImpl ?? fetch;
  const openAiBaseUrl = (options.openAiBaseUrl ?? config.providers.openai.baseUrl).replace(/\/$/u, "");

  router.get("/providers/openai/models", async (req, res, next) => {
    try {
      const apiKey = readSecret("OPENAI_API_KEY")?.trim();

      if (!apiKey) {
        throw new ApiError("OpenAI API key is required before syncing models.", 409, "SETUP_REQUIRED");
      }

      const response = await fetchImpl(`${openAiBaseUrl}/models`, {
        headers: {
          Authorization: `Bearer ${apiKey}`
        }
      });

      if (!response.ok) {
        throw new ApiError(`OpenAI model sync failed with HTTP ${response.status}.`, 502, "PROVIDER_ERROR");
      }

      const body = await response.json() as OpenAIModelsBody;
      const toolType = typeof req.query.toolType === "string" ? req.query.toolType : "";
      const payload: ProviderModelsResponse = {
        models: normalizeOpenAIModels(body.data, toolType),
        provider: "openai",
        source: "openai:/v1/models",
        timestamp: new Date().toISOString()
      };

      res.json(payload);
    } catch (error) {
      next(error);
    }
  });

  return router;
}

function normalizeOpenAIModels(data: unknown, toolType: string): ProviderModelInfo[] {
  if (!Array.isArray(data)) {
    return [];
  }

  const seen = new Set<string>();

  return data
    .map((record) => normalizeOpenAIModel(record))
    .filter((model): model is ProviderModelInfo => Boolean(model))
    .filter((model) => matchesToolType(model.id, toolType))
    .filter((model) => {
      if (seen.has(model.id)) return false;
      seen.add(model.id);
      return true;
    })
    .sort((left, right) => compareModelIds(left.id, right.id));
}

function normalizeOpenAIModel(record: unknown): ProviderModelInfo | null {
  if (typeof record !== "object" || record === null) {
    return null;
  }

  const candidate = record as OpenAIModelRecord;

  if (typeof candidate.id !== "string" || !candidate.id.trim()) {
    return null;
  }

  return {
    created: typeof candidate.created === "number" ? candidate.created : undefined,
    id: candidate.id.trim(),
    ownedBy: typeof candidate.owned_by === "string" ? candidate.owned_by : undefined
  };
}

function matchesToolType(modelId: string, toolType: string): boolean {
  const id = modelId.toLowerCase();

  if (toolType === "image" || toolType === "design_image") {
    return id.startsWith("gpt-image") || id.startsWith("dall-e") || id.includes("image");
  }

  if (toolType === "tts") {
    return id.includes("tts") || id.startsWith("tts-");
  }

  if (toolType === "llm") {
    return (
      (id.startsWith("gpt-") || id.startsWith("o") || id.startsWith("chatgpt-")) &&
      !id.startsWith("gpt-image") &&
      !id.includes("image") &&
      !id.includes("tts") &&
      !id.includes("transcribe") &&
      !id.includes("embedding") &&
      !id.includes("moderation")
    );
  }

  return true;
}

function compareModelIds(left: string, right: string): number {
  const leftRank = modelPriority(left);
  const rightRank = modelPriority(right);

  if (leftRank !== rightRank) {
    return leftRank - rightRank;
  }

  return left.localeCompare(right);
}

function modelPriority(modelId: string): number {
  const priority = [
    "gpt-5.5",
    "gpt-5.5-2026-04-23",
    "gpt-5.4",
    "gpt-5.4-mini",
    "gpt-5.3-codex",
    "gpt-5.3-codex-spark",
    "gpt-5.2",
    "gpt-5.1",
    "gpt-5",
    "gpt-5-mini",
    "gpt-5-nano",
    "gpt-4.1",
    "gpt-4.1-mini",
    "gpt-image-1.5",
    "gpt-image-1",
    "gpt-image-2",
    "gpt-4o-mini-tts",
    "tts-1",
    "tts-1-hd"
  ];
  const index = priority.indexOf(modelId);

  return index >= 0 ? index : 1000;
}
