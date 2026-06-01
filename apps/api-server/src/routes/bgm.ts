import { Router, type Request, type Response } from "express";
import { config } from "@ai-content-factory/config";
import type { GenerateBgmRequest } from "@ai-content-factory/shared-types";
import { contentTemplateTypes } from "@ai-content-factory/shared-types";
import type { StorageAdapter } from "@ai-content-factory/storage";
import type { CostRecorder } from "../modules/costs/cost-recorder.js";
import { createBgmGenerationService, type BgmGenerationService } from "../modules/generation/bgm-service.js";

export interface CreateBgmRouterOptions {
  bgmGenerationService?: BgmGenerationService | undefined;
  costRecorder?: CostRecorder | undefined;
  storage: StorageAdapter;
}

export function createBgmRouter(options: CreateBgmRouterOptions): Router {
  const router = Router();
  const service =
    options.bgmGenerationService ??
    createBgmGenerationService({
      elevenlabs: {
        apiKey: config.providers.elevenlabs.apiKey,
        baseUrl: config.providers.elevenlabs.baseUrl,
        costRMPerMinute: config.providers.elevenlabs.musicCostRMPerMinute,
        model: config.providers.elevenlabs.musicModel,
        outputFormat: config.providers.elevenlabs.musicOutputFormat
      },
      storage: options.storage
    });

  router.post("/generation/bgm", async (req: Request, res: Response, next) => {
    try {
      const response = await service.generateBgm(parseRequest(req.body));
      await options.costRecorder?.record({
        costRM: response.costRM,
        exchangeRate: config.currency.usdToMyrRate,
        jobId: response.jobId,
        model: response.model,
        operation: "generation.bgm",
        provider: response.provider,
        pricingSource: response.costRM > 0 ? "ELEVENLABS_MUSIC_COST_RM_PER_MINUTE / https://help.elevenlabs.io/hc/en-us/articles/37821528996497-How-much-does-Eleven-Music-cost" : "ElevenLabs credit delta recorded; RM conversion not configured",
        pricingStatus: response.costRM > 0 ? "configured_rate" : "pricing_missing",
        quantity: response.durationSeconds,
        service: "bgm",
        toolType: "bgm",
        unit: "seconds",
        usage: response.usage
      });
      res.status(201).json(response);
    } catch (error) {
      next(error);
    }
  });

  return router;
}

function parseRequest(body: unknown): GenerateBgmRequest {
  if (!isRecord(body)) {
    throw new Error("Request body must be an object.");
  }

  return {
    costLimitRM: numberFromBody(body.costLimitRM, 7.5),
    durationSeconds: optionalNumberFromBody(body.durationSeconds),
    jobId: optionalStringFromBody(body.jobId),
    language: body.language === "en-US" ? "en-US" : "zh-CN",
    mood: optionalStringFromBody(body.mood),
    prompt: stringFromBody(body.prompt, "prompt"),
    sceneCount: numberFromBody(body.sceneCount, 5),
    templateType: parseTemplateType(body.templateType),
    topic: stringFromBody(body.topic, "topic"),
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

function parseTemplateType(value: unknown): GenerateBgmRequest["templateType"] {
  if (typeof value === "string" && (contentTemplateTypes as readonly string[]).includes(value)) {
    return value as GenerateBgmRequest["templateType"];
  }

  return "rules_horror";
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
