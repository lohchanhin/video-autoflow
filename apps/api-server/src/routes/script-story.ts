import { Router, type Request, type Response } from "express";
import { config } from "@ai-content-factory/config";
import { contentTemplateTypes, type GenerateScriptStoryRequest, type ProductionBrief } from "@ai-content-factory/shared-types";
import type { StorageAdapter } from "@ai-content-factory/storage";
import type { CostRecorder } from "../modules/costs/cost-recorder.js";
import { createScriptStoryService, type ScriptStoryService } from "../modules/generation/script-story-service.js";

export interface CreateScriptStoryRouterOptions {
  costRecorder?: CostRecorder | undefined;
  scriptStoryService?: ScriptStoryService | undefined;
  storage: StorageAdapter;
}

export function createScriptStoryRouter(options: CreateScriptStoryRouterOptions): Router {
  const router = Router();
  const service =
    options.scriptStoryService ??
    createScriptStoryService({
      openai: {
        apiKey: config.providers.openai.apiKey,
        baseUrl: config.providers.openai.baseUrl,
        model: config.providers.openai.textModel,
        usdToMyrRate: config.currency.usdToMyrRate
      },
      storage: options.storage
    });

  router.post("/generation/script", async (req: Request, res: Response, next) => {
    try {
      const response = await service.generateScriptStory(parseRequest(req.body));
      await recordScriptStoryCost(options, response, "generation.script_story");
      res.status(201).json(response);
    } catch (error) {
      next(error);
    }
  });

  router.post("/cases/draft-outline", async (req: Request, res: Response, next) => {
    try {
      const response = await service.generateScriptStory(parseRequest(req.body));
      await recordScriptStoryCost(options, response, "cases.draft_outline");
      res.status(201).json(response);
    } catch (error) {
      next(error);
    }
  });

  return router;
}

async function recordScriptStoryCost(
  options: CreateScriptStoryRouterOptions,
  response: Awaited<ReturnType<ScriptStoryService["generateScriptStory"]>>,
  operation: string
): Promise<void> {
  const tokenQuantity = (response.usage?.inputTokens ?? 0) + (response.usage?.outputTokens ?? 0);

  await options.costRecorder?.record({
    costRM: response.costRM,
    exchangeRate: config.currency.usdToMyrRate,
    jobId: response.jobId,
    model: response.model,
    operation,
    provider: response.provider,
    pricingSource: response.provider === "openai" ? "https://openai.com/api/pricing/" : "local",
    pricingStatus: response.provider === "openai" ? scriptPricingStatus(response.usage?.pricingMode, response.costRM, tokenQuantity) : "local_zero",
    quantity: tokenQuantity,
    service: "script",
    toolType: "llm",
    unit: "tokens",
    usage: {
      inputTokens: response.usage?.inputTokens ?? 0,
      outputTokens: response.usage?.outputTokens ?? 0,
      pricingMode: response.usage?.pricingMode
    }
  });
}

function scriptPricingStatus(pricingMode: string | undefined, costRM: number, tokenQuantity: number): "actual_usage" | "configured_rate" | "pricing_missing" {
  if (pricingMode === "token_usage") {
    return "actual_usage";
  }

  if (pricingMode === "configured_rate") {
    return "configured_rate";
  }

  if (costRM > 0 && tokenQuantity > 0) {
    return "actual_usage";
  }

  if (costRM > 0) {
    return "configured_rate";
  }

  return "pricing_missing";
}

function parseRequest(body: unknown): GenerateScriptStoryRequest {
  if (!isRecord(body)) {
    throw new Error("Request body must be an object.");
  }

  return {
    costLimitRM: numberFromBody(body.costLimitRM, 7.5),
    durationSeconds: optionalNumberFromBody(body.durationSeconds),
    genre: optionalStringFromBody(body.genre),
    jobId: optionalStringFromBody(body.jobId),
    language: body.language === "en-US" ? "en-US" : "zh-CN",
    prompt: stringFromBody(body.prompt, "prompt"),
    productionBrief: parseProductionBrief(body.productionBrief),
    sceneCount: numberFromBody(body.sceneCount, 5),
    templateType: parseTemplateType(body.templateType),
    topic: stringFromBody(body.topic, "topic"),
    ...toolOverrideFromBody(body)
  };
}

function parseProductionBrief(value: unknown): ProductionBrief | undefined {
  if (!isRecord(value)) {
    return undefined;
  }

  return value as ProductionBrief;
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

function parseTemplateType(value: unknown): GenerateScriptStoryRequest["templateType"] {
  if (typeof value === "string" && (contentTemplateTypes as readonly string[]).includes(value)) {
    return value as GenerateScriptStoryRequest["templateType"];
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
