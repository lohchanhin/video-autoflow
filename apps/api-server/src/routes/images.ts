import { Router, type Request, type Response } from "express";
import { config } from "@ai-content-factory/config";
import { contentTemplateTypes, productionAssetProviders, productionAssetRoles, productionAssetTypes, type CostLogUsage, type GenerateImagesRequest, type GenerateReferenceDesignRequest, type GenerateSceneImageRequest, type ProductionAssetProvider } from "@ai-content-factory/shared-types";
import { connectMongoDatabase, createProductionAssetsRepository, type MongoDatabaseConnection, type ProductionAssetsRepository } from "@ai-content-factory/database";
import type { StorageAdapter } from "@ai-content-factory/storage";
import type { CostRecorder } from "../modules/costs/cost-recorder.js";
import { createImageGenerationService, type ImageGenerationService } from "../modules/generation/image-service.js";
import type { ConnectDatabase } from "./database.js";

export interface CreateImagesRouterOptions {
  connectDatabase?: ConnectDatabase | undefined;
  costRecorder?: CostRecorder | undefined;
  imageGenerationService?: ImageGenerationService | undefined;
  productionAssetsRepository?: ProductionAssetsRepository | undefined;
  storage: StorageAdapter;
  useMongoAssets?: boolean | undefined;
}

export function createImagesRouter(options: CreateImagesRouterOptions): Router {
  const router = Router();
  const service =
    options.imageGenerationService ??
    createImageGenerationService({
      openai: {
        apiKey: config.providers.openai.apiKey,
        baseUrl: config.providers.openai.baseUrl,
        model: config.providers.openai.imageModel,
        quality: config.providers.openai.imageQuality,
        size: config.providers.openai.imageSize,
        usdToMyrRate: config.currency.usdToMyrRate,
        visionModel: config.providers.openai.textModel
      },
      storage: options.storage
    });

  router.post("/generation/images", async (req: Request, res: Response, next) => {
    try {
      const response = await service.generateImages(parseRequest(req.body));
      await options.costRecorder?.record({
        costRM: response.costRM,
        exchangeRate: config.currency.usdToMyrRate,
        jobId: response.jobId,
        model: response.model,
        operation: "generation.scene_images",
        provider: response.provider,
        pricingSource: response.provider === "openai" ? "https://openai.com/api/pricing/" : "local",
        pricingStatus: response.provider === "openai" ? imagePricingStatus(response.images.map((image) => image.usage)) : "local_zero",
        quantity: response.images.length,
        service: "image",
        unit: "image",
        usage: aggregateImageUsage(response.images.map((image) => image.usage))
      });
      res.status(201).json(response);
    } catch (error) {
      next(error);
    }
  });

  router.post("/generation/images/scene", async (req: Request, res: Response, next) => {
    try {
      const response = await service.generateSceneImage(parseSceneRequest(req.body));
      await options.costRecorder?.record({
        costRM: response.costRM,
        exchangeRate: config.currency.usdToMyrRate,
        jobId: response.jobId,
        model: response.model,
        operation: "generation.scene_image",
        provider: response.provider,
        pricingSource: response.provider === "openai" ? "https://openai.com/api/pricing/" : "local",
        pricingStatus: response.provider === "openai" ? imagePricingStatus([response.image.usage]) : "local_zero",
        quantity: 1,
        service: "image",
        unit: "image",
        usage: aggregateImageUsage([response.image.usage])
      });
      res.status(201).json(response);
    } catch (error) {
      next(error);
    }
  });

  router.post("/generation/reference-designs", async (req: Request, res: Response, next) => {
    try {
      const response = await service.generateReferenceDesign(parseReferenceDesignRequest(req.body));
      if (options.useMongoAssets) {
        await upsertReferenceDesignAsset(options, response);
      }
      await options.costRecorder?.record({
        costRM: response.costRM,
        exchangeRate: config.currency.usdToMyrRate,
        jobId: response.jobId,
        model: response.model,
        operation: `generation.reference_design.${response.designType}`,
        provider: response.provider,
        pricingSource: response.provider === "openai" ? "https://openai.com/api/pricing/" : "local",
        pricingStatus: response.provider === "openai" ? imagePricingStatus([response.usage]) : "local_zero",
        quantity: 1,
        service: "reference_design",
        unit: "image",
        usage: {
          ...aggregateImageUsage([response.usage]),
          designType: response.designType,
          sceneId: response.sceneId ?? null
        }
      });
      res.status(201).json(response);
    } catch (error) {
      next(error);
    }
  });

  return router;
}

function aggregateImageUsage(usages: Array<CostLogUsage | undefined>): CostLogUsage {
  const aggregate: CostLogUsage = {
    images: usages.length
  };

  usages.forEach((usage) => {
    if (!usage) return;

    for (const key of ["imageInputTokens", "inputTokens", "outputTokens", "textInputTokens", "totalTokens"]) {
      const value = usage[key];
      if (typeof value === "number") {
        aggregate[key] = (typeof aggregate[key] === "number" ? aggregate[key] : 0) + value;
      }
    }

    if (typeof usage.pricingMode === "string") {
      aggregate.pricingMode = usage.pricingMode;
    }

    if (typeof usage.size === "string") {
      aggregate.size = usage.size;
    }

    if (typeof usage.quality === "string") {
      aggregate.quality = usage.quality;
    }
  });

  return aggregate;
}

function imagePricingStatus(usages: Array<CostLogUsage | undefined>): "actual_usage" | "configured_rate" {
  return usages.some((usage) => usage?.pricingMode === "token_usage") ? "actual_usage" : "configured_rate";
}

async function upsertReferenceDesignAsset(options: CreateImagesRouterOptions, response: Awaited<ReturnType<ImageGenerationService["generateReferenceDesign"]>>): Promise<void> {
  const url = response.asset.publicUrl ?? response.asset.storagePath;
  await withProductionAssetsRepository(options, async (repository) => {
    await repository.upsertByPlanningKey({
      costRM: response.costRM,
      error: "",
      folderName: `Case ${response.jobId}`,
      jobId: response.jobId,
      label: response.designType === "character_design" ? "OpenAI character design" : response.sceneId ? `OpenAI scene ${response.sceneId} design` : "OpenAI scene design",
      notes: `${response.provider} ${response.model} generated this production reference design.`,
      prompt: response.prompt,
      provider: parseProductionAssetProvider(response.provider) ?? "openai",
      role: response.role,
      sceneId: response.sceneId ?? null,
      scope: response.sceneId ? "scene" : "case",
      status: "ready",
      storagePath: response.asset.storagePath,
      tags: ["openai", "reference-design"],
      type: response.designType,
      url
    });
  });
}

async function withProductionAssetsRepository<T>(
  options: CreateImagesRouterOptions,
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

function parseRequest(body: unknown): GenerateImagesRequest {
  if (!isRecord(body)) {
    throw new Error("Request body must be an object.");
  }

  return {
    costLimitRM: numberFromBody(body.costLimitRM, 7.5),
    character: characterFromBody(body.character),
    jobId: optionalStringFromBody(body.jobId),
    language: body.language === "en-US" ? "en-US" : "zh-CN",
    prompt: stringFromBody(body.prompt, "prompt"),
    references: referencesFromBody(body.references),
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

function parseSceneRequest(body: unknown): GenerateSceneImageRequest {
  if (!isRecord(body)) {
    throw new Error("Request body must be an object.");
  }

  return {
    ...parseRequest(body),
    promptOverride: optionalStringFromBody(body.promptOverride),
    sceneId: numberFromBody(body.sceneId, 1)
  };
}

function parseReferenceDesignRequest(body: unknown): GenerateReferenceDesignRequest {
  if (!isRecord(body)) {
    throw new Error("Request body must be an object.");
  }

  return {
    ...parseRequest(body),
    designType: body.designType === "scene_design" ? "scene_design" : "character_design",
    sceneId: optionalNumberFromBody(body.sceneId)
  };
}

function parseTemplateType(value: unknown): GenerateImagesRequest["templateType"] {
  if (typeof value === "string" && (contentTemplateTypes as readonly string[]).includes(value)) {
    return value as GenerateImagesRequest["templateType"];
  }

  return "rules_horror";
}

function parseProductionAssetProvider(value: unknown): ProductionAssetProvider | undefined {
  return typeof value === "string" && (productionAssetProviders as readonly string[]).includes(value) ? value as ProductionAssetProvider : undefined;
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

function referencesFromBody(value: unknown): GenerateImagesRequest["references"] {
  if (!Array.isArray(value)) {
    return undefined;
  }

  const references: NonNullable<GenerateImagesRequest["references"]> = [];

  for (const item of value) {
    if (!isRecord(item)) {
      continue;
    }

    const label = optionalStringFromBody(item.label);
    const url = optionalStringFromBody(item.url);
    const type = typeof item.type === "string" && (productionAssetTypes as readonly string[]).includes(item.type) ? item.type as NonNullable<GenerateImagesRequest["references"]>[number]["type"] : null;

    if (!label || !url || !type) {
      continue;
    }

    const role = typeof item.role === "string" && (productionAssetRoles as readonly string[]).includes(item.role)
      ? item.role as NonNullable<GenerateImagesRequest["references"]>[number]["role"]
      : undefined;

    references.push({
      label,
      notes: optionalStringFromBody(item.notes),
      prompt: optionalStringFromBody(item.prompt),
      role,
      type,
      url
    });
  }

  return references.slice(0, 8);
}

function characterFromBody(value: unknown): GenerateImagesRequest["character"] {
  if (!isRecord(value)) {
    return undefined;
  }

  const name = optionalStringFromBody(value.name);
  const visualIdentity = optionalStringFromBody(value.visualIdentity);

  if (!name || !visualIdentity) {
    return undefined;
  }

  return {
    name,
    referenceNotes: optionalStringFromBody(value.referenceNotes),
    visualIdentity
  };
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
