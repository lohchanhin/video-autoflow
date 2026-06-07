import express, { type ErrorRequestHandler, type Express, type RequestHandler } from "express";
import { config } from "@ai-content-factory/config";
import { createLogger } from "@ai-content-factory/logger";
import { createStorageAdapter, type StorageAdapter } from "@ai-content-factory/storage";
import type { ComposeVideo, VideoGenerationService } from "./modules/generation/local-pipeline.js";
import type { BgmGenerationService } from "./modules/generation/bgm-service.js";
import type { ScriptStoryService } from "./modules/generation/script-story-service.js";
import { createBgmRouter } from "./routes/bgm.js";
import { createCostsRouter } from "./routes/costs.js";
import { createDatabaseRouter, type ConnectDatabase } from "./routes/database.js";
import { createGenerationRouter } from "./routes/generation.js";
import { createHealthRouter } from "./routes/health.js";
import { createImagesRouter } from "./routes/images.js";
import { createProviderModelsRouter } from "./routes/provider-models.js";
import { createProviderKeysRouter, type ProviderSecretReader, type ProviderSecretWriter } from "./routes/provider-keys.js";
import { createProductionAssetsRouter } from "./routes/production-assets.js";
import { createQcRouter } from "./routes/qc.js";
import { createScriptStoryRouter } from "./routes/script-story.js";
import { createSeriesRouter } from "./routes/series.js";
import { createStoryWorldsRouter } from "./routes/story-worlds.js";
import type { ImageGenerationService } from "./modules/generation/image-service.js";
import type { QcReportService } from "./modules/generation/qc-service.js";
import type { SeriesEpisodeIdeaService } from "./modules/series/episode-idea-service.js";
import type { TrendScanService } from "./modules/trends/trend-service.js";
import type { TtsGenerationService } from "./modules/generation/tts-service.js";
import { createTrendsRouter } from "./routes/trends.js";
import { createTtsRouter } from "./routes/tts.js";
import { createVideoClipsRouter } from "./routes/video-clips.js";
import type { VideoClipGenerationService } from "./modules/generation/video-clip-service.js";
import type { ContentSeriesRepository, CostLogsRepository, ProductionAssetsRepository, StoryWorldsRepository } from "@ai-content-factory/database";
import { createCostRecorder } from "./modules/costs/cost-recorder.js";
import { ApiError } from "./errors.js";

const logger = createLogger({ service: "api-server" });

const notFoundHandler: RequestHandler = (_req, res) => {
  res.status(404).json({
    error: {
      code: "NOT_FOUND",
      message: "Route not found."
    }
  });
};

const errorHandler: ErrorRequestHandler = (error, _req, res, _next) => {
  logger.error("Unhandled API error.", { error });

  const message = error instanceof Error ? error.message : "Unexpected server error.";
  const statusCode = error instanceof ApiError
    ? error.statusCode
    : message.includes("OpenAI script generation failed") || message.includes("OpenAI image generation failed") || message.includes("OpenAI TTS generation failed") || message.includes("ElevenLabs music generation failed") || message.includes("Seedance 2.0") || message.includes("BytePlus ModelArk")
        ? 502
        : message.includes("required") || message.includes("must be")
          ? 400
          : 500;
  const errorCode = error instanceof ApiError
    ? error.code
    : statusCode === 400
      ? "BAD_REQUEST"
      : statusCode === 502
        ? "PROVIDER_ERROR"
        : "INTERNAL_SERVER_ERROR";

  res.status(statusCode).json({
    error: {
      code: errorCode,
      message: statusCode === 400 || statusCode === 409 || statusCode === 502 ? message : "Unexpected server error."
    }
  });
};

export interface CreateAppOptions {
  composeVideo?: ComposeVideo | undefined;
  connectDatabase?: ConnectDatabase | undefined;
  contentSeriesRepository?: ContentSeriesRepository | undefined;
  costLogsRepository?: CostLogsRepository | undefined;
  generationService?: VideoGenerationService | undefined;
  allowMockGeneration?: boolean | undefined;
  bgmGenerationService?: BgmGenerationService | undefined;
  imageGenerationService?: ImageGenerationService | undefined;
  productionAssetsRepository?: ProductionAssetsRepository | undefined;
  providerModelsFetch?: typeof fetch | undefined;
  qcReportService?: QcReportService | undefined;
  readProviderSecret?: ProviderSecretReader | undefined;
  writeProviderSecret?: ProviderSecretWriter | undefined;
  scriptStoryService?: ScriptStoryService | undefined;
  seriesEpisodeIdeaService?: SeriesEpisodeIdeaService | undefined;
  storyWorldsRepository?: StoryWorldsRepository | undefined;
  storage?: StorageAdapter | undefined;
  trendScanService?: TrendScanService | undefined;
  ttsGenerationService?: TtsGenerationService | undefined;
  videoClipGenerationService?: VideoClipGenerationService | undefined;
}

export function createApp(options: CreateAppOptions = {}): Express {
  const app = express();
  const storage =
    options.storage ??
    createStorageAdapter({
      apiPublicBaseUrl: config.apiPublicBaseUrl,
      gcs: {
        applicationCredentials: config.storage.gcp.applicationCredentials,
        bucket: config.storage.gcp.bucket,
        prefix: config.storage.gcp.prefix,
        projectId: config.storage.gcp.projectId
      },
      uploadsDir: config.storage.local.uploadsDir
    });
  const costRecorder = process.env.NODE_ENV === "test" && !options.connectDatabase && !options.costLogsRepository
    ? undefined
    : createCostRecorder({
      connectDatabase: options.connectDatabase,
      costLogsRepository: options.costLogsRepository
    });

  app.disable("x-powered-by");
  app.use(corsHeaders);
  app.use(express.json());
  app.use(createHealthRouter({ env: config.env }));
  app.use(createDatabaseRouter({ connectDatabase: options.connectDatabase }));
  app.use(createCostsRouter({ connectDatabase: options.connectDatabase, costLogsRepository: options.costLogsRepository }));
  app.use(createProviderKeysRouter({ readSecret: options.readProviderSecret, writeSecret: options.writeProviderSecret }));
  app.use(createProviderModelsRouter({ fetchImpl: options.providerModelsFetch, readSecret: options.readProviderSecret }));
  app.use(createScriptStoryRouter({ costRecorder, scriptStoryService: options.scriptStoryService, storage }));
  app.use(
    createImagesRouter({
      connectDatabase: options.connectDatabase,
      costRecorder,
      imageGenerationService: options.imageGenerationService,
      productionAssetsRepository: options.productionAssetsRepository,
      storage,
      useMongoAssets: options.imageGenerationService === undefined
    })
  );
  app.use(
    createProductionAssetsRouter({
      connectDatabase: options.connectDatabase,
      costRecorder,
      imageGenerationService: options.imageGenerationService,
      productionAssetsRepository: options.productionAssetsRepository,
      storage
    })
  );
  app.use(createTtsRouter({ costRecorder, storage, ttsGenerationService: options.ttsGenerationService }));
  app.use(createBgmRouter({ bgmGenerationService: options.bgmGenerationService, costRecorder, storage }));
  app.use(
    createVideoClipsRouter({
      connectDatabase: options.connectDatabase,
      costRecorder,
      productionAssetsRepository: options.productionAssetsRepository,
      storage,
      useMongoAssets: options.productionAssetsRepository !== undefined || options.videoClipGenerationService === undefined,
      videoClipGenerationService: options.videoClipGenerationService
    })
  );
  app.use(createQcRouter({ qcReportService: options.qcReportService, storage }));
  app.use(createSeriesRouter({ connectDatabase: options.connectDatabase, contentSeriesRepository: options.contentSeriesRepository, costRecorder, episodeIdeaService: options.seriesEpisodeIdeaService }));
  app.use(createStoryWorldsRouter({ connectDatabase: options.connectDatabase, storyWorldsRepository: options.storyWorldsRepository }));
  app.use(createTrendsRouter({ trendScanService: options.trendScanService }));
  app.use("/uploads", express.static(storage.rootDir, { fallthrough: false }));
  app.use(
    createGenerationRouter({
      composeVideo: options.composeVideo,
      allowMockContent: options.allowMockGeneration,
      costRecorder,
      generationService: options.generationService,
      storage
    })
  );
  app.use(notFoundHandler);
  app.use(errorHandler);

  return app;
}

const corsHeaders: RequestHandler = (req, res, next) => {
  res.header("Access-Control-Allow-Origin", config.adminWebUrl);
  res.header("Access-Control-Allow-Headers", "Content-Type");
  res.header("Access-Control-Allow-Methods", "GET,POST,PATCH,DELETE,OPTIONS");

  if (req.method === "OPTIONS") {
    res.status(204).end();
    return;
  }

  next();
};
