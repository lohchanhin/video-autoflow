import { Router, type Request, type Response } from "express";
import { config } from "@ai-content-factory/config";
import { contentTemplateTypes, type GenerateVideoRequest } from "@ai-content-factory/shared-types";
import { createLogger } from "@ai-content-factory/logger";
import { createVideoGenerationService, type ComposeVideo, type VideoGenerationService } from "../modules/generation/local-pipeline.js";
import type { StorageAdapter } from "@ai-content-factory/storage";
import type { CostRecorder } from "../modules/costs/cost-recorder.js";

const logger = createLogger({ service: "generation-route" });

export interface CreateGenerationRouterOptions {
  allowMockContent?: boolean | undefined;
  composeVideo?: ComposeVideo | undefined;
  costRecorder?: CostRecorder | undefined;
  generationService?: VideoGenerationService | undefined;
  storage: StorageAdapter;
}

export function createGenerationRouter(options: CreateGenerationRouterOptions): Router {
  const router = Router();
  const generationService = options.generationService ?? createVideoGenerationService({
    allowMockContent: options.allowMockContent,
    composeVideo: options.composeVideo,
    storage: options.storage
  });

  router.post("/generation/video", async (req: Request, res: Response, next) => {
    try {
      const input = parseGenerateVideoRequest(req.body);
      const response = await generationService.generateVideo(input);
      await options.costRecorder?.record({
        costRM: response.costRM,
        exchangeRate: config.currency.usdToMyrRate,
        jobId: response.jobId,
        model: input.model ?? "ffmpeg",
        operation: "generation.compose_video",
        provider: input.provider ?? "local_ffmpeg",
        pricingSource: input.cost?.pricingSource ?? "Local FFmpeg compose",
        pricingStatus: response.costRM > 0 ? "configured_rate" : "local_zero",
        quantity: response.durationSeconds,
        service: "compose",
        toolType: "compose",
        unit: "seconds",
        usage: {
          durationSeconds: response.durationSeconds,
          sceneCount: response.storyboard.length,
          storageDriver: response.storage.driver,
          usedSceneClips: Boolean(response.artifacts.sceneClips?.length)
        }
      });

      logger.info("Generated local video.", {
        driver: response.storage.driver,
        jobId: response.jobId,
        videoPath: response.artifacts.finalVideo.storagePath
      });

      res.status(201).json(response);
    } catch (error) {
      next(error);
    }
  });

  return router;
}

function parseGenerateVideoRequest(body: unknown): GenerateVideoRequest {
  if (!isRecord(body)) {
    throw new Error("Request body must be an object.");
  }

  return {
    costLimitRM: numberFromBody(body.costLimitRM, 7.5),
    durationSeconds: optionalNumberFromBody(body.durationSeconds),
    jobId: optionalStringFromBody(body.jobId),
    language: body.language === "en-US" ? "en-US" : "zh-CN",
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

function parseTemplateType(value: unknown): GenerateVideoRequest["templateType"] {
  if (typeof value === "string" && (contentTemplateTypes as readonly string[]).includes(value)) {
    return value as GenerateVideoRequest["templateType"];
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
