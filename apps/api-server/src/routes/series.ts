import { Router, type Request, type Response } from "express";
import { config } from "@ai-content-factory/config";
import {
  connectMongoDatabase,
  createContentSeriesRepository,
  createStoryWorldsRepository,
  type ContentSeriesCreateInput,
  type ContentSeriesPatchInput,
  type ContentSeriesRepository,
  type MongoDatabaseConnection,
  type SeriesEpisodeIdeaPatchInput,
  type StoryWorldsRepository
} from "@ai-content-factory/database";
import {
  contentSeriesStatuses,
  seriesEpisodeIdeaStatuses,
  type ContentSeries,
  type ContentTemplateType,
  type StoryWorld
} from "@ai-content-factory/shared-types";
import { randomUUID } from "node:crypto";
import { ApiError } from "../errors.js";
import type { CostRecorder } from "../modules/costs/cost-recorder.js";
import { createSeriesEpisodeIdeaService, type SeriesEpisodeIdeaService } from "../modules/series/episode-idea-service.js";
import type { ConnectDatabase } from "./database.js";

export interface CreateSeriesRouterOptions {
  connectDatabase?: ConnectDatabase | undefined;
  contentSeriesRepository?: ContentSeriesRepository | undefined;
  costRecorder?: CostRecorder | undefined;
  episodeIdeaService?: SeriesEpisodeIdeaService | undefined;
  storyWorldsRepository?: StoryWorldsRepository | undefined;
}

export function createSeriesRouter(options: CreateSeriesRouterOptions): Router {
  const router = Router();
  const episodeIdeaService =
    options.episodeIdeaService ??
    createSeriesEpisodeIdeaService({
      openai: {
        apiKey: config.providers.openai.apiKey,
        baseUrl: config.providers.openai.baseUrl,
        model: config.providers.openai.textModel,
        usdToMyrRate: config.currency.usdToMyrRate
      }
    });

  router.get("/series", async (_req: Request, res: Response, next) => {
    try {
      const series = await withContentSeriesRepository(options, (repository) => repository.listSeries());
      res.json({
        series,
        timestamp: new Date().toISOString()
      });
    } catch (error) {
      next(error);
    }
  });

  router.post("/series", async (req: Request, res: Response, next) => {
    try {
      const series = await withContentSeriesRepository(options, (repository) => repository.createSeries(parseSeriesCreate(req.body)));
      res.status(201).json({ series });
    } catch (error) {
      next(error);
    }
  });

  router.patch("/series/:id", async (req: Request, res: Response, next) => {
    try {
      const id = paramString(req.params.id);
      const series = await withContentSeriesRepository(options, (repository) => repository.patchSeries(id, parseSeriesPatch(req.body)));

      if (!series) {
        throw new ApiError("Series not found.", 404, "SERIES_NOT_FOUND");
      }

      res.json({ series });
    } catch (error) {
      next(error);
    }
  });

  router.delete("/series/:id", async (req: Request, res: Response, next) => {
    try {
      const id = paramString(req.params.id);
      const deleted = await withContentSeriesRepository(options, (repository) => repository.deleteSeries(id));

      if (!deleted) {
        throw new ApiError("Series not found.", 404, "SERIES_NOT_FOUND");
      }

      res.status(204).end();
    } catch (error) {
      next(error);
    }
  });

  router.get("/series/:id/episodes", async (req: Request, res: Response, next) => {
    try {
      const id = paramString(req.params.id);
      const episodes = await withContentSeriesRepository(options, async (repository) => {
        const series = await repository.findSeriesById(id);

        if (!series) {
          throw new ApiError("Series not found.", 404, "SERIES_NOT_FOUND");
        }

        return repository.listEpisodeIdeas(id);
      });

      res.json({
        episodes,
        timestamp: new Date().toISOString()
      });
    } catch (error) {
      next(error);
    }
  });

  router.post("/series/:id/episodes/generate", async (req: Request, res: Response, next) => {
    try {
      const id = paramString(req.params.id);
      const count = parseIdeaCount(req.body);
      const response = await withContentSeriesRepository(options, async (repository) => {
        const series = await repository.findSeriesById(id);

        if (!series) {
          throw new ApiError("Series not found.", 404, "SERIES_NOT_FOUND");
        }

        const storyWorld = await findStoryWorldForSeries(options, series);
        const generated = await episodeIdeaService.generateEpisodeIdeas({ count, series, storyWorld });
        const episodes = await repository.createEpisodeIdeas(series._id, generated.ideas);

        await options.costRecorder?.record({
          costRM: generated.costRM,
          exchangeRate: config.currency.usdToMyrRate,
          jobId: series._id,
          model: generated.model,
          operation: "series.episode_ideas.generate",
          provider: generated.provider,
          pricingSource: generated.provider === "openai" ? "https://openai.com/api/pricing/" : "local",
          pricingStatus: generated.provider === "openai" ? scriptPricingStatus(generated.usage.pricingMode, generated.costRM, generated.usage.inputTokens + generated.usage.outputTokens) : "local_zero",
          quantity: generated.usage.inputTokens + generated.usage.outputTokens,
          service: "script",
          toolType: "llm",
          unit: "tokens",
          usage: {
            episodeCount: episodes.length,
            inputTokens: generated.usage.inputTokens,
            outputTokens: generated.usage.outputTokens,
            pricingMode: generated.usage.pricingMode,
            seriesId: series._id,
            storyWorldId: storyWorld?._id ?? null
          }
        });

        return {
          costRM: generated.costRM,
          episodes,
          model: generated.model,
          provider: generated.provider,
          status: "EPISODE_IDEAS_GENERATED" as const,
          usage: generated.usage
        };
      });

      res.status(201).json(response);
    } catch (error) {
      next(error);
    }
  });

  router.patch("/series/:id/episodes/:episodeId", async (req: Request, res: Response, next) => {
    try {
      const seriesId = paramString(req.params.id);
      const episodeId = paramString(req.params.episodeId);
      const episode = await withContentSeriesRepository(options, async (repository) => {
        const series = await repository.findSeriesById(seriesId);

        if (!series) {
          throw new ApiError("Series not found.", 404, "SERIES_NOT_FOUND");
        }

        return repository.patchEpisodeIdea(seriesId, episodeId, parseEpisodePatch(req.body));
      });

      if (!episode) {
        throw new ApiError("Episode idea not found.", 404, "EPISODE_IDEA_NOT_FOUND");
      }

      res.json({ episode });
    } catch (error) {
      next(error);
    }
  });

  router.post("/series/:id/episodes/:episodeId/convert-case", async (req: Request, res: Response, next) => {
    try {
      const seriesId = paramString(req.params.id);
      const episodeId = paramString(req.params.episodeId);
      const response = await withContentSeriesRepository(options, async (repository) => {
        const series = await repository.findSeriesById(seriesId);

        if (!series) {
          throw new ApiError("Series not found.", 404, "SERIES_NOT_FOUND");
        }

        const episode = await repository.findEpisodeIdea(seriesId, episodeId);

        if (!episode) {
          throw new ApiError("Episode idea not found.", 404, "EPISODE_IDEA_NOT_FOUND");
        }

        if (episode.status !== "approved") {
          throw new ApiError("Only approved episode ideas can be converted to Case.", 409, "EPISODE_NOT_APPROVED");
        }

        const caseId = parseCaseId(req.body);
        const updatedEpisode = await repository.patchEpisodeIdea(seriesId, episodeId, {
          caseId,
          status: "converted_to_case"
        });

        const storyWorld = await findStoryWorldForSeries(options, series);

        return {
          caseSeed: buildCaseSeed(series, updatedEpisode ?? episode, caseId, storyWorld),
          episode: updatedEpisode ?? episode,
          series,
          status: "EPISODE_CONVERTED_TO_CASE" as const
        };
      });

      res.status(201).json(response);
    } catch (error) {
      next(error);
    }
  });

  return router;
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

async function withContentSeriesRepository<T>(
  options: CreateSeriesRouterOptions,
  callback: (repository: ContentSeriesRepository) => Promise<T>
): Promise<T> {
  if (options.contentSeriesRepository) {
    return callback(options.contentSeriesRepository);
  }

  let connection: MongoDatabaseConnection | null = null;

  try {
    connection = await (options.connectDatabase ?? defaultConnectDatabase)();
    const repository = createContentSeriesRepository(connection);
    return await callback(repository);
  } finally {
    await connection?.close();
  }
}

async function findStoryWorldForSeries(options: CreateSeriesRouterOptions, series: ContentSeries): Promise<StoryWorld | null> {
  if (!series.storyWorldId) {
    return null;
  }

  if (options.storyWorldsRepository) {
    return options.storyWorldsRepository.findById(series.storyWorldId);
  }

  let connection: MongoDatabaseConnection | null = null;

  try {
    connection = await (options.connectDatabase ?? defaultConnectDatabase)();
    const repository = createStoryWorldsRepository(connection);
    return await repository.findById(series.storyWorldId);
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

function buildCaseSeed(series: ContentSeries, episode: { _id: string; moralLesson: string; promptSeed: string; sourceStory: string; synopsis: string; title: string }, caseId: string, storyWorld: StoryWorld | null = null) {
  const episodeWithOptionalFields = episode as {
    continuityNote?: string;
    episodeNo?: number | null;
    interactiveEnding?: string;
    lessonOrTheme?: string;
    serialHook?: string;
    selectedCharacterAssetIds?: string[];
    selectedSceneAssetIds?: string[];
  };
  const referenceAssetIds = uniqueStrings(series.referenceAssetIds);
  const characterAssetIds = uniqueStrings(episodeWithOptionalFields.selectedCharacterAssetIds ?? []);
  const sceneAssetIds = uniqueStrings(episodeWithOptionalFields.selectedSceneAssetIds ?? []);
  const allReferenceAssetIds = uniqueStrings([...referenceAssetIds, ...characterAssetIds, ...sceneAssetIds]);
  const prompt = [
    `系列：${series.name}`,
    `单集题目：${episode.title}`,
    `核心看点/价值：${episodeWithOptionalFields.lessonOrTheme || episode.moralLesson}`,
    `来源/灵感：${episode.sourceStory}`,
    `剧情梗概：${episode.synopsis}`,
    `制作种子：${episode.promptSeed}`,
    episodeWithOptionalFields.interactiveEnding ? `互动结尾：${episodeWithOptionalFields.interactiveEnding}` : "",
    "",
    `系列定位：${series.description}`,
    `系列目标/价值：${series.values}`,
    `叙事语气：${series.tone}`,
    `视觉风格：${series.visualStyle}`,
    `BGM 风格：${series.musicStyle}`,
    `安全规则：${series.safetyRules}`,
    "",
    "请严格按照以上系列设定生成原创、可拍、可审核的短视频脚本和分镜。不要额外强加未在系列中指定的题材、受众、语气或限制。",
    `Narrative mode: ${series.narrativeMode}`,
    `Drama intensity: ${series.dramaIntensity}`,
    series.continuityRules ? `Continuity rules: ${series.continuityRules}` : "",
    episodeWithOptionalFields.continuityNote ? `Continuity note: ${episodeWithOptionalFields.continuityNote}` : "",
    episodeWithOptionalFields.serialHook ? `Serial hook: ${episodeWithOptionalFields.serialHook}` : ""
  ].join("\n");

  return {
    backgroundAssetId: sceneAssetIds[0] ?? null,
    characterAssetId: characterAssetIds[0] ?? null,
    characterAssetIds,
    costLimitRM: 7.5,
    durationSeconds: series.durationSeconds,
    episodeId: episode._id,
    genre: series.contentType,
    id: caseId,
    language: series.language,
    prompt,
    productionBrief: {
      episodeContext: {
        continuityNote: episodeWithOptionalFields.continuityNote ?? "",
        episodeId: episode._id,
        episodeNo: episodeWithOptionalFields.episodeNo ?? null,
        interactiveEnding: episodeWithOptionalFields.interactiveEnding ?? "",
        lessonOrTheme: episodeWithOptionalFields.lessonOrTheme || episode.moralLesson,
        promptSeed: episode.promptSeed,
        serialHook: episodeWithOptionalFields.serialHook ?? "",
        synopsis: episode.synopsis,
        title: episode.title
      },
      lessonOrTheme: episodeWithOptionalFields.lessonOrTheme || episode.moralLesson,
      requiredBeats: [episode.synopsis, episode.promptSeed, episodeWithOptionalFields.interactiveEnding ?? ""].filter(Boolean),
      selectedCharacters: characterAssetIds.map((assetId) => ({
        assetId,
        label: assetId,
        visualIdentity: "Use the approved character design asset from the asset library."
      })),
      selectedScenes: sceneAssetIds.map((assetId) => ({
        assetId,
        label: assetId,
        visualRules: "Use the approved scene design asset from the asset library."
      })),
      seriesContext: {
        audience: series.audience,
        continuityRules: series.continuityRules,
        contentType: series.contentType,
        description: series.description,
        dramaIntensity: series.dramaIntensity,
        musicStyle: series.musicStyle,
        name: series.name,
        narrativeMode: series.narrativeMode,
        safetyRules: series.safetyRules,
        seriesId: series._id,
        tone: series.tone,
        values: series.values,
        visualStyle: series.visualStyle
      },
      storyWorldContext: storyWorld ? {
        description: storyWorld.description,
        name: storyWorld.name,
        relationshipMap: storyWorld.relationshipMap,
        safetyRules: storyWorld.safetyRules,
        storyWorldId: storyWorld._id,
        visualStyle: storyWorld.visualStyle
      } : series.storyWorldId ? { storyWorldId: series.storyWorldId } : undefined,
      tone: series.tone,
      visualContinuityRules: [
        storyWorld?.description,
        storyWorld?.relationshipMap,
        series.continuityRules,
        series.visualStyle,
        "Reuse selected recurring characters and scene assets when provided. Do not swap the story world, cast, or main setting unless the episode explicitly asks for it."
      ].filter(Boolean)
    },
    referenceAssetIds: allReferenceAssetIds,
    sceneCount: series.sceneCount,
    sceneAssetIds,
    seriesId: series._id,
    storyWorldId: series.storyWorldId,
    templateType: inferTemplateTypeFromSeries(series),
    topic: episode.title
  };
}

function parseSeriesCreate(body: unknown): ContentSeriesCreateInput {
  if (!isRecord(body)) {
    throw new ApiError("Request body must be an object.", 400, "BAD_REQUEST");
  }

  const name = stringFromUnknown(body.name, "");

  if (!name) {
    throw new ApiError("name is required.", 400, "BAD_REQUEST");
  }

  return {
    audience: optionalString(body.audience),
    continuityRules: optionalString(body.continuityRules),
    contentType: optionalString(body.contentType),
    description: optionalString(body.description),
    dramaIntensity: parseDramaIntensity(body.dramaIntensity),
    durationSeconds: numberFromUnknown(body.durationSeconds, 45),
    id: optionalString(body.id),
    language: body.language === "en-US" ? "en-US" : "zh-CN",
    musicStyle: optionalString(body.musicStyle),
    name,
    narrativeMode: parseNarrativeMode(body.narrativeMode),
    referenceAssetIds: stringArrayFromUnknown(body.referenceAssetIds),
    safetyRules: optionalString(body.safetyRules),
    sceneCount: numberFromUnknown(body.sceneCount, 5),
    status: parseSeriesStatus(body.status),
    storyWorldId: body.storyWorldId === null ? null : optionalString(body.storyWorldId),
    tone: optionalString(body.tone),
    values: optionalString(body.values),
    visualStyle: optionalString(body.visualStyle)
  };
}

function parseSeriesPatch(body: unknown): ContentSeriesPatchInput {
  if (!isRecord(body)) {
    throw new ApiError("Request body must be an object.", 400, "BAD_REQUEST");
  }

  const patch: ContentSeriesPatchInput = {};
  const status = parseSeriesStatus(body.status);

  if (body.audience !== undefined) patch.audience = stringFromUnknown(body.audience, "");
  if (body.continuityRules !== undefined) patch.continuityRules = stringFromUnknown(body.continuityRules, "");
  if (body.contentType !== undefined) patch.contentType = stringFromUnknown(body.contentType, "");
  if (body.description !== undefined) patch.description = stringFromUnknown(body.description, "");
  if (body.dramaIntensity !== undefined) patch.dramaIntensity = parseDramaIntensity(body.dramaIntensity);
  if (body.durationSeconds !== undefined) patch.durationSeconds = numberFromUnknown(body.durationSeconds, 45);
  if (body.language !== undefined) patch.language = body.language === "en-US" ? "en-US" : "zh-CN";
  if (body.musicStyle !== undefined) patch.musicStyle = stringFromUnknown(body.musicStyle, "");
  if (body.name !== undefined) patch.name = stringFromUnknown(body.name, "");
  if (body.narrativeMode !== undefined) patch.narrativeMode = parseNarrativeMode(body.narrativeMode);
  if (body.referenceAssetIds !== undefined) patch.referenceAssetIds = stringArrayFromUnknown(body.referenceAssetIds);
  if (body.safetyRules !== undefined) patch.safetyRules = stringFromUnknown(body.safetyRules, "");
  if (body.sceneCount !== undefined) patch.sceneCount = numberFromUnknown(body.sceneCount, 5);
  if (status) patch.status = status;
  if (body.storyWorldId !== undefined) patch.storyWorldId = body.storyWorldId === null ? null : stringFromUnknown(body.storyWorldId, "");
  if (body.tone !== undefined) patch.tone = stringFromUnknown(body.tone, "");
  if (body.values !== undefined) patch.values = stringFromUnknown(body.values, "");
  if (body.visualStyle !== undefined) patch.visualStyle = stringFromUnknown(body.visualStyle, "");

  return patch;
}

function parseEpisodePatch(body: unknown): SeriesEpisodeIdeaPatchInput {
  if (!isRecord(body)) {
    throw new ApiError("Request body must be an object.", 400, "BAD_REQUEST");
  }

  const patch: SeriesEpisodeIdeaPatchInput = {};
  const status = parseEpisodeStatus(body.status);

  if (body.ageRange !== undefined) patch.ageRange = stringFromUnknown(body.ageRange, "");
  if (body.caseId !== undefined) patch.caseId = body.caseId === null ? null : stringFromUnknown(body.caseId, "");
  if (body.continuityNote !== undefined) patch.continuityNote = stringFromUnknown(body.continuityNote, "");
  if (body.episodeNo !== undefined) patch.episodeNo = body.episodeNo === null ? null : numberFromUnknown(body.episodeNo, 1);
  if (body.interactiveEnding !== undefined) patch.interactiveEnding = stringFromUnknown(body.interactiveEnding, "");
  if (body.lessonOrTheme !== undefined) patch.lessonOrTheme = stringFromUnknown(body.lessonOrTheme, "");
  if (body.moralLesson !== undefined) patch.moralLesson = stringFromUnknown(body.moralLesson, "");
  if (body.promptSeed !== undefined) patch.promptSeed = stringFromUnknown(body.promptSeed, "");
  if (body.riskNotes !== undefined) patch.riskNotes = stringFromUnknown(body.riskNotes, "");
  if (body.serialHook !== undefined) patch.serialHook = stringFromUnknown(body.serialHook, "");
  if (body.selectedCharacterAssetIds !== undefined) patch.selectedCharacterAssetIds = stringArrayFromUnknown(body.selectedCharacterAssetIds);
  if (body.selectedSceneAssetIds !== undefined) patch.selectedSceneAssetIds = stringArrayFromUnknown(body.selectedSceneAssetIds);
  if (body.sourceStory !== undefined) patch.sourceStory = stringFromUnknown(body.sourceStory, "");
  if (status) patch.status = status;
  if (body.synopsis !== undefined) patch.synopsis = stringFromUnknown(body.synopsis, "");
  if (body.title !== undefined) patch.title = stringFromUnknown(body.title, "");

  return patch;
}

function parseIdeaCount(body: unknown): number {
  const record = isRecord(body) ? body : {};
  return Math.max(1, Math.min(30, Math.round(numberFromUnknown(record.count, 10))));
}

function parseCaseId(body: unknown): string {
  const record = isRecord(body) ? body : {};
  return optionalString(record.caseId) ?? `job_${randomUUID().slice(0, 8)}`;
}

function inferTemplateTypeFromSeries(series: ContentSeries): ContentTemplateType {
  const value = `${series.contentType} ${series.description} ${series.name}`.toLowerCase();

  if (/(喜剧|搞笑|comedy|sketch|笑)/iu.test(value)) return "comedy_sketch";
  if (/(爱情|恋爱|romance|love)/iu.test(value)) return "romance_story";
  if (/(童话|寓言|fairy|fable|storybook|魔法|奇幻)/iu.test(value)) return "fairy_tale";
  if (/(监控|cctv|surveillance|录像)/iu.test(value)) return "surveillance_horror";
  if (/(规则|恐怖|horror|rule)/iu.test(value)) return "rules_horror";

  return "urban_legend";
}

function parseSeriesStatus(value: unknown) {
  return typeof value === "string" && (contentSeriesStatuses as readonly string[]).includes(value) ? value as (typeof contentSeriesStatuses)[number] : undefined;
}

function parseEpisodeStatus(value: unknown) {
  return typeof value === "string" && (seriesEpisodeIdeaStatuses as readonly string[]).includes(value) ? value as (typeof seriesEpisodeIdeaStatuses)[number] : undefined;
}

function parseNarrativeMode(value: unknown) {
  return value === "serialized" ? "serialized" : "standalone";
}

function parseDramaIntensity(value: unknown) {
  if (value === "low" || value === "high" || value === "melodrama") {
    return value;
  }

  return "medium";
}

function paramString(value: string | string[] | undefined): string {
  const id = Array.isArray(value) ? value[0] : value;

  if (!id) {
    throw new ApiError("id is required.", 400, "BAD_REQUEST");
  }

  return id;
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

function stringArrayFromUnknown(value: unknown): string[] {
  if (!Array.isArray(value)) {
    return [];
  }

  return uniqueStrings(value);
}

function uniqueStrings(value: unknown[]): string[] {
  return value
    .filter((item): item is string => typeof item === "string" && item.trim().length > 0)
    .map((item) => item.trim())
    .filter((item, index, items) => items.indexOf(item) === index)
    .slice(0, 50);
}
