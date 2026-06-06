import { Router, type Request, type Response } from "express";
import { config } from "@ai-content-factory/config";
import { connectMongoDatabase, createProductionAssetsRepository, type MongoDatabaseConnection, type ProductionAssetsRepository } from "@ai-content-factory/database";
import type { GenerateVideoClipRequest, ProductionAsset } from "@ai-content-factory/shared-types";
import type { StorageAdapter } from "@ai-content-factory/storage";
import { createLogger } from "@ai-content-factory/logger";
import type { CostRecorder } from "../modules/costs/cost-recorder.js";
import { createVideoClipGenerationService, type VideoClipGenerationService } from "../modules/generation/video-clip-service.js";
import type { ConnectDatabase } from "./database.js";

const logger = createLogger({ service: "video-clips-route" });

export interface CreateVideoClipsRouterOptions {
  connectDatabase?: ConnectDatabase | undefined;
  costRecorder?: CostRecorder | undefined;
  productionAssetsRepository?: ProductionAssetsRepository | undefined;
  storage: StorageAdapter;
  useMongoAssets?: boolean | undefined;
  videoClipGenerationService?: VideoClipGenerationService | undefined;
}

export function createVideoClipsRouter(options: CreateVideoClipsRouterOptions): Router {
  const router = Router();
  const videoClipGenerationService = options.videoClipGenerationService ?? createVideoClipGenerationService({ storage: options.storage });

  router.post("/generation/video-clips/scene", async (req: Request, res: Response, next) => {
    try {
      const input = parseGenerateVideoClipRequest(req.body);
      const hydratedInput = await hydrateSeedanceInputWithMongoAssets(options, input);
      const response = await videoClipGenerationService.generateVideoClip(hydratedInput);
      const totalTokens = response.usage?.totalTokens;

      logger.info("Generated Seedance video clip.", {
        jobId: response.jobId,
        mode: response.clip.mode,
        sceneId: response.clip.sceneId,
        taskId: response.clip.taskId
      });

      await options.costRecorder?.record({
        costRM: response.costRM,
        exchangeRate: config.currency.usdToMyrRate,
        jobId: response.jobId,
        model: response.model,
        operation: `generation.seedance.${response.clip.mode}`,
        provider: response.provider,
        pricingSource: "https://docs.byteplus.com/en/docs/ModelArk/2191775",
        pricingStatus: typeof totalTokens === "number" && totalTokens > 0 ? "actual_usage" : response.costRM > 0 ? "configured_rate" : "pricing_missing",
        quantity: typeof totalTokens === "number" && totalTokens > 0 ? totalTokens : response.clip.durationSeconds,
        service: "video",
        toolType: "video",
        unit: typeof totalTokens === "number" && totalTokens > 0 ? "tokens" : "seconds",
        usage: response.usage
      });
      res.status(201).json(response);
    } catch (error) {
      next(error);
    }
  });

  return router;
}

async function hydrateSeedanceInputWithMongoAssets(options: CreateVideoClipsRouterOptions, input: GenerateVideoClipRequest): Promise<GenerateVideoClipRequest> {
  if (!options.useMongoAssets || !input.jobId) {
    return input;
  }

  const assets = await withProductionAssetsRepository(options, (repository) =>
    repository.list({
      jobId: input.jobId,
      status: ["ready", "approved"]
    })
  );

  const selectedSceneId = input.sceneId ?? firstSceneIdFromAssets(assets) ?? 1;
  const firstFrame = findAssetByRole(assets, "first_frame", selectedSceneId);
  const lastFrame = findAssetByRole(assets, "last_frame", selectedSceneId);
  const hydratedReferenceImageUrls = assets
    .filter((asset) => asset.role === "reference_image" && (asset.sceneId === null || asset.sceneId === selectedSceneId) && asset.url.trim())
    .map((asset) => asset.url.trim())
    .filter((url, index, urls) => url !== firstFrame?.url && url !== lastFrame?.url && urls.indexOf(url) === index)
    .slice(0, 8);
  const hasFrameMedia = Boolean(firstFrame?.url || lastFrame?.url || input.imageUrl || input.lastFrameImageUrl);
  const referenceImageUrls = hasFrameMedia ? [] : hydratedReferenceImageUrls;

  return {
    ...input,
    imageUrl: firstFrame?.url || input.imageUrl,
    lastFrameImageUrl: lastFrame?.url || input.lastFrameImageUrl,
    referenceImageUrls,
    sceneId: selectedSceneId
  };
}

async function withProductionAssetsRepository<T>(
  options: CreateVideoClipsRouterOptions,
  callback: (repository: ProductionAssetsRepository) => Promise<T>
): Promise<T> {
  if (options.productionAssetsRepository) {
    return callback(options.productionAssetsRepository);
  }

  let connection: MongoDatabaseConnection | null = null;

  try {
    connection = await (options.connectDatabase ?? defaultConnectDatabase)();
    const repository = createProductionAssetsRepository(connection);
    return await callback(repository);
  } finally {
    await connection?.close();
  }
}

async function defaultConnectDatabase(): Promise<MongoDatabaseConnection> {
  return connectMongoDatabase({
    dbName: config.mongoDbName,
    mongoUri: config.mongoUri,
    serverSelectionTimeoutMS: 3000
  });
}

function findAssetByRole(assets: ProductionAsset[], role: "first_frame" | "last_frame", sceneId: number): ProductionAsset | undefined {
  return assets.find((asset) => asset.role === role && asset.sceneId === sceneId && asset.url.trim()) ?? assets.find((asset) => asset.role === role && asset.sceneId === null && asset.url.trim());
}

function firstSceneIdFromAssets(assets: ProductionAsset[]): number | undefined {
  return assets
    .filter((asset) => asset.sceneId !== null && asset.url.trim())
    .map((asset) => asset.sceneId)
    .sort((left, right) => (left ?? 0) - (right ?? 0))[0] ?? undefined;
}

function parseGenerateVideoClipRequest(body: unknown): GenerateVideoClipRequest {
  if (!isRecord(body)) {
    throw new Error("Request body must be an object.");
  }

  return {
    aspectRatio: parseAspectRatio(body.aspectRatio),
    costLimitRM: numberFromBody(body.costLimitRM, 7.5),
    durationSeconds: optionalNumberFromBody(body.durationSeconds),
    imageUrl: optionalStringFromBody(body.imageUrl),
    jobId: optionalStringFromBody(body.jobId),
    lastFrameImageUrl: optionalStringFromBody(body.lastFrameImageUrl),
    prompt: stringFromBody(body.prompt, "prompt"),
    quality: parseQuality(body.quality),
    referenceImageUrls: optionalStringArrayFromBody(body.referenceImageUrls),
    sceneId: optionalNumberFromBody(body.sceneId),
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

function parseAspectRatio(value: unknown): GenerateVideoClipRequest["aspectRatio"] {
  const allowed = ["9:16", "16:9", "1:1", "4:3", "3:4", "21:9", "adaptive"] as const;
  return typeof value === "string" && (allowed as readonly string[]).includes(value) ? value as GenerateVideoClipRequest["aspectRatio"] : undefined;
}

function parseQuality(value: unknown): GenerateVideoClipRequest["quality"] {
  return value === "480p" || value === "720p" ? value : undefined;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function stringFromBody(value: unknown, name: string): string {
  if (typeof value !== "string" || !value.trim()) {
    throw new Error(`${name} is required.`);
  }

  return value.trim();
}

function optionalStringFromBody(value: unknown): string | undefined {
  return typeof value === "string" && value.trim() ? value.trim() : undefined;
}

function optionalStringArrayFromBody(value: unknown): string[] | undefined {
  if (!Array.isArray(value)) {
    return undefined;
  }

  const strings = value.filter((item): item is string => typeof item === "string" && item.trim().length > 0).map((item) => item.trim());
  return strings.length > 0 ? strings : undefined;
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
