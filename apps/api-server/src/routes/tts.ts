import { Router, type Request, type Response } from "express";
import { config } from "@ai-content-factory/config";
import type { GenerateTtsRequest } from "@ai-content-factory/shared-types";
import type { StorageAdapter } from "@ai-content-factory/storage";
import type { CostRecorder } from "../modules/costs/cost-recorder.js";
import { createTtsGenerationService, type TtsGenerationService } from "../modules/generation/tts-service.js";

export interface CreateTtsRouterOptions {
  costRecorder?: CostRecorder | undefined;
  storage: StorageAdapter;
  ttsGenerationService?: TtsGenerationService | undefined;
}

export function createTtsRouter(options: CreateTtsRouterOptions): Router {
  const router = Router();
  const service =
    options.ttsGenerationService ??
    createTtsGenerationService({
      openai: {
        apiKey: config.providers.openai.apiKey,
        baseUrl: config.providers.openai.baseUrl,
        costUsdPer1KChars: config.providers.openai.ttsCostUsdPer1KChars,
        format: config.providers.openai.ttsFormat,
        model: config.providers.openai.ttsModel,
        usdToMyrRate: config.currency.usdToMyrRate,
        voice: config.providers.openai.ttsVoice
      },
      storage: options.storage
    });

  router.post("/generation/tts", async (req: Request, res: Response, next) => {
    try {
      const response = await service.generateTts(parseRequest(req.body));
      const characterCount = response.usage?.characterCount;
      await options.costRecorder?.record({
        costRM: response.costRM,
        exchangeRate: config.currency.usdToMyrRate,
        jobId: response.jobId,
        model: response.model,
        operation: "generation.tts",
        provider: response.provider,
        pricingSource: "OPENAI_TTS_COST_USD_PER_1K_CHARS / https://openai.com/api/pricing/",
        pricingStatus: "configured_rate",
        quantity: typeof characterCount === "number" ? characterCount : response.voiceoverText.length,
        service: "tts",
        unit: "characters",
        usage: response.usage
      });
      res.status(201).json(response);
    } catch (error) {
      next(error);
    }
  });

  return router;
}

function parseRequest(body: unknown): GenerateTtsRequest {
  if (!isRecord(body)) {
    throw new Error("Request body must be an object.");
  }

  return {
    costLimitRM: numberFromBody(body.costLimitRM, 7.5),
    jobId: optionalStringFromBody(body.jobId),
    language: body.language === "en-US" ? "en-US" : "zh-CN",
    voice: optionalStringFromBody(body.voice),
    voiceoverText: stringFromBody(body.voiceoverText, "voiceoverText"),
    ...toolOverrideFromBody(body)
  };
}

function toolOverrideFromBody(body: Record<string, unknown>) {
  return {
    apiStyle: optionalStringFromBody(body.apiStyle),
    baseUrl: optionalStringFromBody(body.baseUrl),
    cost: isRecord(body.cost) ? {
      costMode: optionalStringFromBody(body.cost.costMode),
      fallbackCostRM: optionalNumberFromBody(body.cost.fallbackCostRM),
      inputUnitPriceRM: optionalNumberFromBody(body.cost.inputUnitPriceRM),
      outputUnitPriceRM: optionalNumberFromBody(body.cost.outputUnitPriceRM),
      pricingSource: optionalStringFromBody(body.cost.pricingSource)
    } : undefined,
    model: optionalStringFromBody(body.model),
    params: isRecord(body.params) ? body.params as Record<string, boolean | number | string | null | undefined> : undefined,
    provider: optionalStringFromBody(body.provider)
  };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function stringFromBody(value: unknown, name: string): string {
  if (typeof value !== "string" || !value.trim()) {
    throw new Error(`${name} is required.`);
  }

  return value;
}

function optionalStringFromBody(value: unknown): string | undefined {
  return typeof value === "string" && value.trim() ? value : undefined;
}

function numberFromBody(value: unknown, fallback: number): number {
  const numberValue = typeof value === "number" ? value : Number(value);
  return Number.isFinite(numberValue) ? numberValue : fallback;
}

function optionalNumberFromBody(value: unknown): number | undefined {
  if (value === undefined || value === null || value === "") {
    return undefined;
  }

  const numberValue = typeof value === "number" ? value : Number(value);
  return Number.isFinite(numberValue) ? numberValue : undefined;
}
