import { Router, type Request, type Response } from "express";
import { config } from "@ai-content-factory/config";
import {
  connectMongoDatabase,
  createProductionAssetsRepository,
  type BootstrapProductionAssetsInput,
  type MongoDatabaseConnection,
  type ProductionAssetCreateInput,
  type ProductionAssetListFilter,
  type ProductionAssetPatchInput,
  type ProductionAssetsRepository
} from "@ai-content-factory/database";
import {
  contentTemplateTypes,
  productionAssetProviders,
  productionAssetRoles,
  productionAssetStatuses,
  productionAssetTypes,
  type CostLogUsage,
  type GenerateProductionAssetResponse,
  type ProductionAsset,
  type ProductionAssetProvider,
  type ProductionAssetRole,
  type ProductionAssetStatus,
  type ProductionAssetType
} from "@ai-content-factory/shared-types";
import type { StorageAdapter } from "@ai-content-factory/storage";
import { ApiError } from "../errors.js";
import type { CostRecorder } from "../modules/costs/cost-recorder.js";
import { createImageGenerationService, type ImageGenerationService } from "../modules/generation/image-service.js";
import type { ConnectDatabase } from "./database.js";

export interface CreateProductionAssetsRouterOptions {
  connectDatabase?: ConnectDatabase | undefined;
  costRecorder?: CostRecorder | undefined;
  imageGenerationService?: ImageGenerationService | undefined;
  productionAssetsRepository?: ProductionAssetsRepository | undefined;
  storage: StorageAdapter;
}

export function createProductionAssetsRouter(options: CreateProductionAssetsRouterOptions): Router {
  const router = Router();
  const imageGenerationService =
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

  router.get("/assets/production", async (req: Request, res: Response, next) => {
    try {
      const filter = parseListFilter(req.query);
      const assets = await withProductionAssetsRepository(options, (repository) => repository.list(filter));

      res.json({
        assets,
        timestamp: new Date().toISOString()
      });
    } catch (error) {
      next(error);
    }
  });

  router.post("/assets/production", async (req: Request, res: Response, next) => {
    try {
      const asset = await withProductionAssetsRepository(options, (repository) => repository.create(parseCreateInput(req.body)));
      res.status(201).json({ asset });
    } catch (error) {
      next(error);
    }
  });

  router.patch("/assets/production/:id", async (req: Request, res: Response, next) => {
    try {
      const id = paramString(req.params.id);
      const updated = await withProductionAssetsRepository(options, (repository) => repository.patch(id, parsePatchInput(req.body)));

      if (!updated) {
        throw new ApiError("Production asset not found.", 404, "PRODUCTION_ASSET_NOT_FOUND");
      }

      res.json({ asset: updated });
    } catch (error) {
      next(error);
    }
  });

  router.delete("/assets/production/:id", async (req: Request, res: Response, next) => {
    try {
      const id = paramString(req.params.id);
      const deleted = await withProductionAssetsRepository(options, (repository) => repository.delete(id));

      if (!deleted) {
        throw new ApiError("Production asset not found.", 404, "PRODUCTION_ASSET_NOT_FOUND");
      }

      res.status(204).end();
    } catch (error) {
      next(error);
    }
  });

  router.post("/assets/production/bootstrap-case", async (req: Request, res: Response, next) => {
    try {
      const result = await withProductionAssetsRepository(options, (repository) => repository.bootstrapCase(parseBootstrapInput(req.body)));

      res.status(201).json({
        ...result,
        status: "ASSETS_BOOTSTRAPPED"
      });
    } catch (error) {
      next(error);
    }
  });

  router.post("/assets/production/:id/generate", async (req: Request, res: Response, next) => {
    try {
      const id = paramString(req.params.id);
      const response = await withProductionAssetsRepository(options, async (repository) => {
        const asset = await repository.findById(id);

        if (!asset) {
          throw new ApiError("Production asset not found.", 404, "PRODUCTION_ASSET_NOT_FOUND");
        }

        await repository.patch(asset._id, { error: "", status: "generating" });

        try {
          const generated = await generateProductionAsset(imageGenerationService, asset, req.body);
          const updatedAsset = await repository.patch(asset._id, generated.patch);

          if (!updatedAsset) {
            throw new ApiError("Production asset not found after generation.", 404, "PRODUCTION_ASSET_NOT_FOUND");
          }

          await options.costRecorder?.record({
            costRM: generated.costRM,
            exchangeRate: config.currency.usdToMyrRate,
            jobId: updatedAsset.jobId,
            model: generated.model,
            operation: generated.operation,
            provider: generated.provider,
            pricingSource: generated.provider === "openai" ? "https://openai.com/api/pricing/" : "local",
            pricingStatus: generated.provider === "openai" ? imageUsagePricingStatus(generated.costRM, generated.usage) : "local_zero",
            quantity: generated.quantity,
            service: generated.service,
            toolType: generated.service === "reference_design" ? "design_image" : "image",
            unit: generated.unit,
            usage: {
              ...generated.usage,
              assetId: updatedAsset._id,
              assetType: updatedAsset.type,
              sceneId: updatedAsset.sceneId ?? null
            }
          });

          return {
            asset: updatedAsset,
            costRM: generated.costRM,
            status: "ASSET_GENERATED"
          } satisfies GenerateProductionAssetResponse;
        } catch (error) {
          const message = error instanceof Error ? error.message : "Production asset generation failed.";

          await repository.patch(asset._id, {
            error: message,
            status: "failed"
          });

          if (error instanceof ApiError) {
            throw error;
          }

          throw new ApiError(message, 502, "PRODUCTION_ASSET_GENERATION_FAILED");
        }
      });

      res.status(201).json(response);
    } catch (error) {
      next(error);
    }
  });

  return router;
}

async function withProductionAssetsRepository<T>(
  options: CreateProductionAssetsRouterOptions,
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

async function generateProductionAsset(
  imageGenerationService: ImageGenerationService,
  asset: ProductionAsset,
  body: unknown
): Promise<{ costRM: number; model: string; operation: string; patch: ProductionAssetPatchInput; provider: string; quantity: number; service: "image" | "reference_design"; unit: string; usage?: CostLogUsage | undefined }> {
  if (asset.type === "bgm_reference") {
    throw new ApiError("BGM reference generation is handled by the BGM tool, not the OpenAI image tool.", 400, "UNSUPPORTED_ASSET_GENERATION");
  }

  const context = parseGenerationContext(body, asset);

  if (asset.type === "first_frame" || asset.type === "last_frame") {
    const generated = await imageGenerationService.generateSceneImage({
      ...context,
      promptOverride: asset.prompt || context.prompt,
      sceneId: asset.sceneId ?? 1
    });
    const storageObject = generated.image.asset;

    return {
      costRM: generated.costRM,
      model: generated.model,
      operation: `assets.production.${asset.type}`,
      patch: {
        costRM: Number((asset.costRM + generated.costRM).toFixed(4)),
        error: "",
        prompt: generated.image.prompt,
        provider: parseProductionAssetProvider(generated.provider) ?? "openai",
        role: asset.type === "last_frame" ? "last_frame" : "first_frame",
        status: generated.requiresReview ? "ready" : "ready",
        storagePath: storageObject.storagePath,
        url: storageObject.publicUrl ?? storageObject.storagePath
      },
      provider: generated.provider,
      quantity: 1,
      service: "image",
      unit: "image",
      usage: generated.image.usage
    };
  }

  const generated = await imageGenerationService.generateReferenceDesign({
    ...context,
    designType: asset.type === "character_design" ? "character_design" : "scene_design",
    jobId: getReferenceDesignStorageJobId(asset),
    sceneId: asset.sceneId ?? undefined
  });
  const storageObject = generated.asset;

  return {
    costRM: generated.costRM,
    model: generated.model,
    operation: `assets.production.${asset.type}`,
    patch: {
      costRM: Number((asset.costRM + generated.costRM).toFixed(4)),
      error: "",
      prompt: generated.prompt,
      provider: parseProductionAssetProvider(generated.provider) ?? "openai",
      role: "reference_image",
      status: "ready",
      storagePath: storageObject.storagePath,
      url: storageObject.publicUrl ?? storageObject.storagePath
    },
    provider: generated.provider,
    quantity: 1,
    service: "reference_design",
    unit: "image",
    usage: generated.usage
  };
}

function getReferenceDesignStorageJobId(asset: ProductionAsset): string {
  const safeAssetId = asset._id.replace(/[^a-zA-Z0-9_-]/gu, "_");

  if (asset.jobId === "asset_library") {
    return `asset_library/${safeAssetId}`;
  }

  return `${asset.jobId}/production_assets/${safeAssetId}`;
}

function imageUsagePricingStatus(costRM: number, usage: CostLogUsage | undefined): "actual_usage" | "configured_rate" | "pricing_missing" {
  if (usage?.pricingMode === "token_usage") {
    return "actual_usage";
  }

  return costRM > 0 ? "configured_rate" : "pricing_missing";
}

function parseGenerationContext(body: unknown, asset: ProductionAsset) {
  const record = isRecord(body) ? body : {};

  return {
    costLimitRM: numberFromUnknown(record.costLimitRM, 7.5),
    jobId: asset.jobId,
    language: record.language === "en-US" ? "en-US" as const : "zh-CN" as const,
    prompt: stringFromUnknown(record.prompt, asset.prompt || asset.label),
    sceneCount: numberFromUnknown(record.sceneCount, Math.max(asset.sceneId ?? 1, 5)),
    templateType: parseTemplateType(record.templateType),
    topic: stringFromUnknown(record.topic, asset.label),
    ...toolOverrideFromBody(record)
  };
}

function toolOverrideFromBody(body: Record<string, unknown>) {
  return {
    apiStyle: optionalString(body.apiStyle),
    baseUrl: optionalString(body.baseUrl),
    cost: isRecord(body.cost) ? {
      costMode: optionalString(body.cost.costMode),
      fallbackCostRM: optionalNumberFromUnknown(body.cost.fallbackCostRM),
      inputUnitPriceRM: optionalNumberFromUnknown(body.cost.inputUnitPriceRM),
      outputUnitPriceRM: optionalNumberFromUnknown(body.cost.outputUnitPriceRM),
      pricingSource: optionalString(body.cost.pricingSource)
    } : undefined,
    model: optionalString(body.model),
    params: isRecord(body.params) ? body.params as Record<string, boolean | number | string | null | undefined> : undefined,
    provider: optionalString(body.provider)
  };
}

function parseListFilter(query: Request["query"]): ProductionAssetListFilter {
  const status = parseProductionAssetStatus(firstQueryValue(query.status));
  const type = parseProductionAssetType(firstQueryValue(query.type));
  const jobId = firstQueryValue(query.jobId)?.trim();
  const filter: ProductionAssetListFilter = {};

  if (jobId) filter.jobId = jobId;
  if (status) filter.status = status;
  if (type) filter.type = type;

  return filter;
}

function parseCreateInput(body: unknown): ProductionAssetCreateInput {
  if (!isRecord(body)) {
    throw new ApiError("Request body must be an object.", 400, "BAD_REQUEST");
  }

  const jobId = stringFromUnknown(body.jobId, "");
  const type = parseProductionAssetType(body.type);

  if (!jobId) {
    throw new ApiError("jobId is required.", 400, "BAD_REQUEST");
  }

  if (!type) {
    throw new ApiError("type is required.", 400, "BAD_REQUEST");
  }

  return {
    costRM: numberFromUnknown(body.costRM, 0),
    error: stringFromUnknown(body.error, ""),
    folderName: stringFromUnknown(body.folderName, "未分类"),
    id: optionalString(body.id),
    jobId,
    label: stringFromUnknown(body.label, ""),
    notes: stringFromUnknown(body.notes, ""),
    prompt: stringFromUnknown(body.prompt, ""),
    provider: parseProductionAssetProvider(body.provider) ?? "manual",
    role: parseProductionAssetRole(body.role),
    sceneId: nullableNumberFromUnknown(body.sceneId),
    scope: body.scope === "scene" ? "scene" : "case",
    status: parseProductionAssetStatus(body.status) ?? "planned",
    storagePath: stringFromUnknown(body.storagePath, ""),
    tags: stringArrayFromUnknown(body.tags),
    type,
    url: stringFromUnknown(body.url, "")
  };
}

function parsePatchInput(body: unknown): ProductionAssetPatchInput {
  if (!isRecord(body)) {
    throw new ApiError("Request body must be an object.", 400, "BAD_REQUEST");
  }

  const patch: ProductionAssetPatchInput = {};
  const type = parseProductionAssetType(body.type);
  const provider = parseProductionAssetProvider(body.provider);
  const role = parseProductionAssetRole(body.role);
  const status = parseProductionAssetStatus(body.status);

  if (body.costRM !== undefined) patch.costRM = numberFromUnknown(body.costRM, 0);
  if (body.error !== undefined) patch.error = stringFromUnknown(body.error, "");
  if (body.folderName !== undefined) patch.folderName = stringFromUnknown(body.folderName, "未分类");
  if (body.label !== undefined) patch.label = stringFromUnknown(body.label, "");
  if (body.notes !== undefined) patch.notes = stringFromUnknown(body.notes, "");
  if (body.prompt !== undefined) patch.prompt = stringFromUnknown(body.prompt, "");
  if (provider) patch.provider = provider;
  if (role) patch.role = role;
  if (body.sceneId !== undefined) patch.sceneId = nullableNumberFromUnknown(body.sceneId);
  if (body.scope !== undefined) patch.scope = body.scope === "scene" ? "scene" : "case";
  if (status) patch.status = status;
  if (body.storagePath !== undefined) patch.storagePath = stringFromUnknown(body.storagePath, "");
  if (body.tags !== undefined) patch.tags = stringArrayFromUnknown(body.tags);
  if (type) patch.type = type;
  if (body.url !== undefined) patch.url = stringFromUnknown(body.url, "");

  return patch;
}

function parseBootstrapInput(body: unknown): BootstrapProductionAssetsInput {
  if (!isRecord(body)) {
    throw new ApiError("Request body must be an object.", 400, "BAD_REQUEST");
  }

  const jobId = stringFromUnknown(body.jobId, "");
  const topic = stringFromUnknown(body.topic, "");

  if (!jobId) {
    throw new ApiError("jobId is required.", 400, "BAD_REQUEST");
  }

  if (!topic) {
    throw new ApiError("topic is required.", 400, "BAD_REQUEST");
  }

  return {
    includeLastFrames: body.includeLastFrames === true,
    jobId,
    prompt: optionalString(body.prompt),
    sceneCount: numberFromUnknown(body.sceneCount, 5),
    topic
  };
}

function firstQueryValue(value: Request["query"][string]): string | undefined {
  if (Array.isArray(value)) {
    return typeof value[0] === "string" ? value[0] : undefined;
  }

  return typeof value === "string" ? value : undefined;
}

function paramString(value: string | string[] | undefined): string {
  const id = Array.isArray(value) ? value[0] : value;

  if (!id) {
    throw new ApiError("id is required.", 400, "BAD_REQUEST");
  }

  return id;
}

function parseTemplateType(value: unknown) {
  return typeof value === "string" && (contentTemplateTypes as readonly string[]).includes(value) ? value as (typeof contentTemplateTypes)[number] : "urban_legend";
}

function parseProductionAssetType(value: unknown): ProductionAssetType | undefined {
  return typeof value === "string" && (productionAssetTypes as readonly string[]).includes(value) ? value as ProductionAssetType : undefined;
}

function parseProductionAssetStatus(value: unknown): ProductionAssetStatus | undefined {
  return typeof value === "string" && (productionAssetStatuses as readonly string[]).includes(value) ? value as ProductionAssetStatus : undefined;
}

function parseProductionAssetProvider(value: unknown): ProductionAssetProvider | undefined {
  return typeof value === "string" && (productionAssetProviders as readonly string[]).includes(value) ? value as ProductionAssetProvider : undefined;
}

function parseProductionAssetRole(value: unknown): ProductionAssetRole | undefined {
  return typeof value === "string" && (productionAssetRoles as readonly string[]).includes(value) ? value as ProductionAssetRole : undefined;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function optionalString(value: unknown): string | undefined {
  return typeof value === "string" && value.trim() ? value.trim() : undefined;
}

function stringFromUnknown(value: unknown, fallback: string): string {
  return typeof value === "string" ? value.trim() : fallback;
}

function numberFromUnknown(value: unknown, fallback: number): number {
  const numberValue = typeof value === "number" ? value : Number(value);
  return Number.isFinite(numberValue) ? numberValue : fallback;
}

function optionalNumberFromUnknown(value: unknown): number | undefined {
  if (value === undefined || value === null || value === "") {
    return undefined;
  }

  const numberValue = typeof value === "number" ? value : Number(value);
  return Number.isFinite(numberValue) ? numberValue : undefined;
}

function nullableNumberFromUnknown(value: unknown): number | null {
  if (value === undefined || value === null || value === "") {
    return null;
  }

  const numberValue = typeof value === "number" ? value : Number(value);
  return Number.isFinite(numberValue) ? Math.max(1, Math.round(numberValue)) : null;
}

function stringArrayFromUnknown(value: unknown): string[] {
  if (!Array.isArray(value)) {
    return [];
  }

  return value
    .filter((item): item is string => typeof item === "string" && item.trim().length > 0)
    .map((item) => item.trim())
    .filter((item, index, items) => items.indexOf(item) === index)
    .slice(0, 20);
}
