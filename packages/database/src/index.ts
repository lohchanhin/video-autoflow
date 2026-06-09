import { randomUUID } from "node:crypto";
import { MongoClient, type Collection, type Db, type Document, type Filter, type MongoClientOptions } from "mongodb";
import type {
  AppStateEntry,
  ContentSeries,
  ContentSeriesStatus,
  CostLog,
  CostLogPricingStatus,
  CostLogToolType,
  CostLogUsage,
  ProductionAsset,
  ProductionAssetProvider,
  ProductionAssetRole,
  ProductionAssetStatus,
  ProductionAssetType,
  SeriesEpisodeIdea,
  SeriesEpisodeIdeaStatus,
  StoryWorld
} from "@ai-content-factory/shared-types";

export interface MongoDatabaseConfig {
  appName?: string | undefined;
  dbName?: string | undefined;
  mongoUri: string;
  serverSelectionTimeoutMS?: number | undefined;
}

export interface MongoDatabaseConnection {
  client: MongoClient;
  collection<TSchema extends Document = Document>(name: string): Collection<TSchema>;
  close(): Promise<void>;
  db: Db;
  ping(): Promise<DatabasePingResult>;
}

export interface DatabasePingResult {
  databaseName: string;
  ok: boolean;
}

export type MongoClientFactory = (mongoUri: string, options: MongoClientOptions) => MongoClient;

export function createMongoClient(mongoUri: string, options: MongoClientOptions = {}): MongoClient {
  return new MongoClient(mongoUri, options);
}

export async function connectMongoDatabase(
  config: MongoDatabaseConfig,
  clientFactory: MongoClientFactory = createMongoClient
): Promise<MongoDatabaseConnection> {
  const dbName = config.dbName ?? getDatabaseNameFromMongoUri(config.mongoUri);
  const client = clientFactory(config.mongoUri, {
    appName: config.appName ?? "ai-content-factory",
    serverSelectionTimeoutMS: config.serverSelectionTimeoutMS ?? 5000
  });

  await client.connect();

  return createMongoDatabaseConnection(client, dbName);
}

export function createMongoDatabaseConnection(client: MongoClient, dbName: string): MongoDatabaseConnection {
  const db = client.db(dbName);

  return {
    client,
    collection<TSchema extends Document = Document>(name: string): Collection<TSchema> {
      return db.collection<TSchema>(name);
    },
    async close(): Promise<void> {
      await client.close();
    },
    db,
    async ping(): Promise<DatabasePingResult> {
      const result = await db.command({ ping: 1 });

      return {
        databaseName: db.databaseName,
        ok: result.ok === 1
      };
    }
  };
}

export function getDatabaseNameFromMongoUri(mongoUri: string, fallback = "ai_content_factory"): string {
  try {
    const parsed = new URL(mongoUri);
    const databaseName = decodeURIComponent(parsed.pathname.replace(/^\//u, "")).trim();
    return databaseName || fallback;
  } catch {
    return fallback;
  }
}

export type CostLogDocument = CostLog & Document;
export type AppStateDocument = AppStateEntry & Document;

export interface AppStateRepository {
  ensureIndexes(): Promise<void>;
  list(prefix?: string | undefined): Promise<AppStateEntry[]>;
  upsert(key: string, value: string): Promise<AppStateEntry>;
  upsertMany(entries: Array<{ key: string; value: string }>): Promise<AppStateEntry[]>;
}

export function createAppStateRepository(connection: MongoDatabaseConnection): AppStateRepository {
  const collection = connection.collection<AppStateDocument>("app_state");

  return {
    async ensureIndexes(): Promise<void> {
      await collection.createIndex({ key: 1 }, { unique: true });
    },

    async list(prefix?: string | undefined): Promise<AppStateEntry[]> {
      await this.ensureIndexes();

      const query: Filter<AppStateDocument> = prefix ? { key: { $regex: `^${escapeRegExp(prefix)}` } } as Filter<AppStateDocument> : {};
      const rows = await collection.find(query).sort({ key: 1 }).toArray();
      return rows.map(stripAppStateDocument);
    },

    async upsert(key: string, value: string): Promise<AppStateEntry> {
      await this.ensureIndexes();

      const now = new Date().toISOString();
      const existing = await collection.findOne({ key } as Filter<AppStateDocument>);
      const entry: AppStateEntry = {
        key,
        updatedAt: now,
        value
      };

      if (existing) {
        await collection.findOneAndUpdate({ key } as Filter<AppStateDocument>, { $set: entry });
        return entry;
      }

      await collection.insertOne({ _id: key, ...entry } as unknown as AppStateDocument);
      return entry;
    },

    async upsertMany(entries: Array<{ key: string; value: string }>): Promise<AppStateEntry[]> {
      const saved: AppStateEntry[] = [];

      for (const entry of entries) {
        saved.push(await this.upsert(entry.key, entry.value));
      }

      return saved;
    }
  };
}

export interface CostLogCreateInput {
  costRM: number;
  costUSD?: number | undefined;
  exchangeRate: number;
  id?: string | undefined;
  jobId: string;
  model: string;
  operation: string;
  provider: CostLog["provider"];
  pricingSource: string;
  pricingStatus: CostLogPricingStatus;
  quantity: number;
  service: CostLog["service"];
  toolType: CostLogToolType;
  unit: string;
  usage?: CostLogUsage | undefined;
}

function stripAppStateDocument(document: AppStateDocument): AppStateEntry {
  return {
    key: document.key,
    updatedAt: document.updatedAt,
    value: document.value
  };
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/gu, "\\$&");
}

export interface CostLogListFilter {
  jobId?: string | undefined;
  provider?: CostLog["provider"] | undefined;
  service?: CostLog["service"] | undefined;
  limit?: number | undefined;
}

export interface CostLogsRepository {
  create(input: CostLogCreateInput): Promise<CostLog>;
  ensureIndexes(): Promise<void>;
  list(filter?: CostLogListFilter): Promise<CostLog[]>;
  summary(filter?: Pick<CostLogListFilter, "jobId">): Promise<{
    byProvider: Array<{ costRM: number; provider: CostLog["provider"] }>;
    byService: Array<{ costRM: number; service: CostLog["service"] }>;
    pricingMissingCount: number;
    totalCostRM: number;
    totalCostUSD: number;
    totalLogs: number;
  }>;
}

export function createCostLogsRepository(connection: MongoDatabaseConnection): CostLogsRepository {
  const collection = connection.collection<CostLogDocument>("cost_logs");

  return {
    async create(input: CostLogCreateInput): Promise<CostLog> {
      await this.ensureIndexes();

      const log = normalizeCostLog(input);
      await collection.insertOne(log as CostLogDocument);
      return log;
    },

    async ensureIndexes(): Promise<void> {
      await Promise.all([
        collection.createIndex({ jobId: 1, createdAt: -1 }),
        collection.createIndex({ provider: 1, service: 1, createdAt: -1 }),
        collection.createIndex({ pricingStatus: 1, createdAt: -1 })
      ]);
    },

    async list(filter: CostLogListFilter = {}): Promise<CostLog[]> {
      const query: Filter<CostLogDocument> = {};

      if (filter.jobId) query.jobId = filter.jobId;
      if (filter.provider) query.provider = filter.provider;
      if (filter.service) query.service = filter.service;

      const limit = Math.max(1, Math.min(500, Math.round(filter.limit ?? 100)));
      const logs = await collection.find(query).sort({ createdAt: -1 }).limit(limit).toArray();
      return logs.map(stripCostLogDocument);
    },

    async summary(filter: Pick<CostLogListFilter, "jobId"> = {}) {
      const query: Filter<CostLogDocument> = {};

      if (filter.jobId) query.jobId = filter.jobId;

      const logs = (await collection.find(query).toArray()).map(stripCostLogDocument);
      const byProvider = sumCostsBy(logs, "provider") as Array<{ costRM: number; provider: CostLog["provider"] }>;
      const byService = sumCostsBy(logs, "service") as Array<{ costRM: number; service: CostLog["service"] }>;

      return {
        byProvider,
        byService,
        pricingMissingCount: logs.filter((log) => log.pricingStatus === "pricing_missing").length,
        totalCostRM: round4(logs.reduce((sum, log) => sum + log.costRM, 0)),
        totalCostUSD: round6(logs.reduce((sum, log) => sum + log.costUSD, 0)),
        totalLogs: logs.length
      };
    }
  };
}

export type ContentSeriesDocument = ContentSeries & Document;
export type SeriesEpisodeIdeaDocument = SeriesEpisodeIdea & Document;
export type StoryWorldDocument = StoryWorld & Document;

export interface ContentSeriesCreateInput {
  audience?: string | undefined;
  contentType?: string | undefined;
  description?: string | undefined;
  durationSeconds?: number | undefined;
  id?: string | undefined;
  language?: ContentSeries["language"] | undefined;
  musicStyle?: string | undefined;
  name: string;
  referenceAssetIds?: string[] | undefined;
  safetyRules?: string | undefined;
  sceneCount?: number | undefined;
  status?: ContentSeriesStatus | undefined;
  storyWorldId?: string | null | undefined;
  tone?: string | undefined;
  values?: string | undefined;
  visualStyle?: string | undefined;
}

export interface ContentSeriesPatchInput {
  audience?: string | undefined;
  contentType?: string | undefined;
  description?: string | undefined;
  durationSeconds?: number | undefined;
  language?: ContentSeries["language"] | undefined;
  musicStyle?: string | undefined;
  name?: string | undefined;
  referenceAssetIds?: string[] | undefined;
  safetyRules?: string | undefined;
  sceneCount?: number | undefined;
  status?: ContentSeriesStatus | undefined;
  storyWorldId?: string | null | undefined;
  tone?: string | undefined;
  values?: string | undefined;
  visualStyle?: string | undefined;
}

export interface SeriesEpisodeIdeaCreateInput {
  ageRange?: string | undefined;
  caseId?: string | null | undefined;
  episodeNo?: number | null | undefined;
  id?: string | undefined;
  interactiveEnding?: string | undefined;
  lessonOrTheme?: string | undefined;
  moralLesson: string;
  promptSeed: string;
  riskNotes?: string | undefined;
  selectedCharacterAssetIds?: string[] | undefined;
  selectedSceneAssetIds?: string[] | undefined;
  seriesId?: string | undefined;
  sourceStory?: string | undefined;
  status?: SeriesEpisodeIdeaStatus | undefined;
  synopsis: string;
  title: string;
}

export interface SeriesEpisodeIdeaPatchInput {
  ageRange?: string | undefined;
  caseId?: string | null | undefined;
  episodeNo?: number | null | undefined;
  interactiveEnding?: string | undefined;
  lessonOrTheme?: string | undefined;
  moralLesson?: string | undefined;
  promptSeed?: string | undefined;
  riskNotes?: string | undefined;
  selectedCharacterAssetIds?: string[] | undefined;
  selectedSceneAssetIds?: string[] | undefined;
  sourceStory?: string | undefined;
  status?: SeriesEpisodeIdeaStatus | undefined;
  synopsis?: string | undefined;
  title?: string | undefined;
}

export interface ContentSeriesRepository {
  createSeries(input: ContentSeriesCreateInput): Promise<ContentSeries>;
  createEpisodeIdeas(seriesId: string, ideas: SeriesEpisodeIdeaCreateInput[]): Promise<SeriesEpisodeIdea[]>;
  deleteSeries(id: string): Promise<boolean>;
  ensureIndexes(): Promise<void>;
  findEpisodeIdea(seriesId: string, episodeId: string): Promise<SeriesEpisodeIdea | null>;
  findSeriesById(id: string): Promise<ContentSeries | null>;
  listEpisodeIdeas(seriesId: string): Promise<SeriesEpisodeIdea[]>;
  listSeries(): Promise<ContentSeries[]>;
  patchEpisodeIdea(seriesId: string, episodeId: string, patch: SeriesEpisodeIdeaPatchInput): Promise<SeriesEpisodeIdea | null>;
  patchSeries(id: string, patch: ContentSeriesPatchInput): Promise<ContentSeries | null>;
}

export interface StoryWorldCreateInput {
  defaultSceneAssetIds?: string[] | undefined;
  description?: string | undefined;
  id?: string | undefined;
  name: string;
  recurringCharacterAssetIds?: string[] | undefined;
  relationshipMap?: string | undefined;
  safetyRules?: string | undefined;
  seriesIds?: string[] | undefined;
  status?: StoryWorld["status"] | undefined;
  visualStyle?: string | undefined;
}

export interface StoryWorldPatchInput {
  defaultSceneAssetIds?: string[] | undefined;
  description?: string | undefined;
  name?: string | undefined;
  recurringCharacterAssetIds?: string[] | undefined;
  relationshipMap?: string | undefined;
  safetyRules?: string | undefined;
  seriesIds?: string[] | undefined;
  status?: StoryWorld["status"] | undefined;
  visualStyle?: string | undefined;
}

export interface StoryWorldsRepository {
  create(input: StoryWorldCreateInput): Promise<StoryWorld>;
  delete(id: string): Promise<boolean>;
  ensureIndexes(): Promise<void>;
  findById(id: string): Promise<StoryWorld | null>;
  list(): Promise<StoryWorld[]>;
  patch(id: string, patch: StoryWorldPatchInput): Promise<StoryWorld | null>;
}

export function createContentSeriesRepository(connection: MongoDatabaseConnection): ContentSeriesRepository {
  const seriesCollection = connection.collection<ContentSeriesDocument>("content_series");
  const episodesCollection = connection.collection<SeriesEpisodeIdeaDocument>("series_episode_ideas");

  return {
    async createSeries(input: ContentSeriesCreateInput): Promise<ContentSeries> {
      await this.ensureIndexes();

      const series = normalizeContentSeries(input);
      await seriesCollection.insertOne(series as ContentSeriesDocument);
      return series;
    },

    async createEpisodeIdeas(seriesId: string, ideas: SeriesEpisodeIdeaCreateInput[]): Promise<SeriesEpisodeIdea[]> {
      await this.ensureIndexes();

      const normalizedSeriesId = seriesId.trim();
      const episodes = ideas.map((idea) => normalizeSeriesEpisodeIdea({ ...idea, seriesId: normalizedSeriesId }));

      if (episodes.length > 0) {
        await episodesCollection.insertMany(episodes as SeriesEpisodeIdeaDocument[]);
      }

      return episodes;
    },

    async deleteSeries(id: string): Promise<boolean> {
      const result = await seriesCollection.deleteOne({ _id: id } as Filter<ContentSeriesDocument>);

      if (result.deletedCount === 1) {
        await episodesCollection.deleteMany({ seriesId: id } as Filter<SeriesEpisodeIdeaDocument>);
        return true;
      }

      return false;
    },

    async ensureIndexes(): Promise<void> {
      await Promise.all([
        seriesCollection.createIndex({ status: 1, updatedAt: -1 }),
        seriesCollection.createIndex({ name: 1 }),
        episodesCollection.createIndex({ seriesId: 1, status: 1 }),
        episodesCollection.createIndex({ seriesId: 1, createdAt: -1 }),
        episodesCollection.createIndex({ caseId: 1 })
      ]);
    },

    async findEpisodeIdea(seriesId: string, episodeId: string): Promise<SeriesEpisodeIdea | null> {
      const episode = await episodesCollection.findOne({ _id: episodeId, seriesId } as Filter<SeriesEpisodeIdeaDocument>);
      return episode ? stripSeriesEpisodeIdeaDocument(episode) : null;
    },

    async findSeriesById(id: string): Promise<ContentSeries | null> {
      const series = await seriesCollection.findOne({ _id: id } as Filter<ContentSeriesDocument>);
      return series ? stripContentSeriesDocument(series) : null;
    },

    async listEpisodeIdeas(seriesId: string): Promise<SeriesEpisodeIdea[]> {
      const episodes = await episodesCollection
        .find({ seriesId } as Filter<SeriesEpisodeIdeaDocument>)
        .sort({ createdAt: -1 })
        .toArray();
      return episodes.map(stripSeriesEpisodeIdeaDocument);
    },

    async listSeries(): Promise<ContentSeries[]> {
      const series = await seriesCollection.find({}).sort({ updatedAt: -1 }).toArray();
      return series.map(stripContentSeriesDocument);
    },

    async patchEpisodeIdea(seriesId: string, episodeId: string, patch: SeriesEpisodeIdeaPatchInput): Promise<SeriesEpisodeIdea | null> {
      const update = normalizeSeriesEpisodeIdeaPatch(patch);

      if (Object.keys(update).length === 0) {
        return this.findEpisodeIdea(seriesId, episodeId);
      }

      const result = await episodesCollection.findOneAndUpdate(
        { _id: episodeId, seriesId } as Filter<SeriesEpisodeIdeaDocument>,
        { $set: { ...update, updatedAt: new Date().toISOString() } as Document },
        { returnDocument: "after" }
      );
      return result ? stripSeriesEpisodeIdeaDocument(result) : null;
    },

    async patchSeries(id: string, patch: ContentSeriesPatchInput): Promise<ContentSeries | null> {
      const update = normalizeContentSeriesPatch(patch);

      if (Object.keys(update).length === 0) {
        return this.findSeriesById(id);
      }

      const result = await seriesCollection.findOneAndUpdate(
        { _id: id } as Filter<ContentSeriesDocument>,
        { $set: { ...update, updatedAt: new Date().toISOString() } as Document },
        { returnDocument: "after" }
      );
      return result ? stripContentSeriesDocument(result) : null;
    }
  };
}

export function createStoryWorldsRepository(connection: MongoDatabaseConnection): StoryWorldsRepository {
  const collection = connection.collection<StoryWorldDocument>("story_worlds");

  return {
    async create(input: StoryWorldCreateInput): Promise<StoryWorld> {
      await this.ensureIndexes();

      const storyWorld = normalizeStoryWorld(input);
      await collection.insertOne(storyWorld as StoryWorldDocument);
      return storyWorld;
    },

    async delete(id: string): Promise<boolean> {
      const result = await collection.deleteOne({ _id: id } as Filter<StoryWorldDocument>);
      return result.deletedCount === 1;
    },

    async ensureIndexes(): Promise<void> {
      await Promise.all([
        collection.createIndex({ status: 1, updatedAt: -1 }),
        collection.createIndex({ name: 1 }),
        collection.createIndex({ seriesIds: 1 })
      ]);
    },

    async findById(id: string): Promise<StoryWorld | null> {
      const storyWorld = await collection.findOne({ _id: id } as Filter<StoryWorldDocument>);
      return storyWorld ? stripStoryWorldDocument(storyWorld) : null;
    },

    async list(): Promise<StoryWorld[]> {
      const storyWorlds = await collection.find({}).sort({ updatedAt: -1 }).toArray();
      return storyWorlds.map(stripStoryWorldDocument);
    },

    async patch(id: string, patch: StoryWorldPatchInput): Promise<StoryWorld | null> {
      const update = normalizeStoryWorldPatch(patch);

      if (Object.keys(update).length === 0) {
        return this.findById(id);
      }

      const result = await collection.findOneAndUpdate(
        { _id: id } as Filter<StoryWorldDocument>,
        { $set: { ...update, updatedAt: new Date().toISOString() } as Document },
        { returnDocument: "after" }
      );
      return result ? stripStoryWorldDocument(result) : null;
    }
  };
}

export type ProductionAssetDocument = ProductionAsset & Document;

export interface ProductionAssetCreateInput {
  costRM?: number | undefined;
  error?: string | undefined;
  folderName?: string | undefined;
  id?: string | undefined;
  jobId: string;
  label: string;
  notes?: string | undefined;
  prompt?: string | undefined;
  provider?: ProductionAssetProvider | undefined;
  role?: ProductionAssetRole | undefined;
  sceneId?: number | null | undefined;
  scope?: "case" | "scene" | undefined;
  status?: ProductionAssetStatus | undefined;
  storagePath?: string | undefined;
  tags?: string[] | undefined;
  type: ProductionAssetType;
  url?: string | undefined;
}

export interface ProductionAssetListFilter {
  jobId?: string | undefined;
  folderName?: string | undefined;
  status?: ProductionAssetStatus | ProductionAssetStatus[] | undefined;
  type?: ProductionAssetType | undefined;
}

export interface ProductionAssetPatchInput {
  costRM?: number | undefined;
  error?: string | undefined;
  folderName?: string | undefined;
  label?: string | undefined;
  notes?: string | undefined;
  prompt?: string | undefined;
  provider?: ProductionAssetProvider | undefined;
  role?: ProductionAssetRole | undefined;
  sceneId?: number | null | undefined;
  scope?: "case" | "scene" | undefined;
  status?: ProductionAssetStatus | undefined;
  storagePath?: string | undefined;
  tags?: string[] | undefined;
  type?: ProductionAssetType | undefined;
  url?: string | undefined;
}

export interface BootstrapProductionAssetsInput {
  includeLastFrames?: boolean | undefined;
  jobId: string;
  prompt?: string | undefined;
  sceneCount: number;
  topic: string;
}

export interface ProductionAssetsRepository {
  bootstrapCase(input: BootstrapProductionAssetsInput): Promise<{ assets: ProductionAsset[]; created: number }>;
  create(input: ProductionAssetCreateInput): Promise<ProductionAsset>;
  delete(id: string): Promise<boolean>;
  ensureIndexes(): Promise<void>;
  findById(id: string): Promise<ProductionAsset | null>;
  list(filter?: ProductionAssetListFilter): Promise<ProductionAsset[]>;
  patch(id: string, patch: ProductionAssetPatchInput): Promise<ProductionAsset | null>;
  upsertByPlanningKey(input: ProductionAssetCreateInput): Promise<{ asset: ProductionAsset; created: boolean }>;
}

export function createProductionAssetsRepository(connection: MongoDatabaseConnection): ProductionAssetsRepository {
  const collection = connection.collection<ProductionAssetDocument>("production_assets");

  return {
    async bootstrapCase(input: BootstrapProductionAssetsInput): Promise<{ assets: ProductionAsset[]; created: number }> {
      await this.ensureIndexes();

      const plannedAssets = buildPlannedProductionAssets(input);
      const results = await Promise.all(plannedAssets.map((asset) => this.upsertByPlanningKey(asset)));

      return {
        assets: results.map((result) => result.asset),
        created: results.filter((result) => result.created).length
      };
    },

    async create(input: ProductionAssetCreateInput): Promise<ProductionAsset> {
      await this.ensureIndexes();

      const asset = normalizeProductionAsset(input);
      await collection.insertOne(asset as ProductionAssetDocument);
      return asset;
    },

    async delete(id: string): Promise<boolean> {
      const result = await collection.deleteOne({ _id: id } as Filter<ProductionAssetDocument>);
      return result.deletedCount === 1;
    },

    async ensureIndexes(): Promise<void> {
      await Promise.all([
        collection.createIndex({ jobId: 1, type: 1, sceneId: 1 }),
        collection.createIndex({ jobId: 1, status: 1 }),
        collection.createIndex({ type: 1, status: 1 }),
        collection.createIndex({ folderName: 1, type: 1 })
      ]);
    },

    async findById(id: string): Promise<ProductionAsset | null> {
      const asset = await collection.findOne({ _id: id } as Filter<ProductionAssetDocument>);
      return asset ? stripMongoDocument(asset) : null;
    },

    async list(filter: ProductionAssetListFilter = {}): Promise<ProductionAsset[]> {
      const query: Filter<ProductionAssetDocument> = {};

      if (filter.jobId) {
        query.jobId = filter.jobId;
      }

      if (filter.folderName) {
        query.folderName = filter.folderName;
      }

      if (filter.type) {
        query.type = filter.type;
      }

      if (filter.status) {
        if (Array.isArray(filter.status)) {
          (query as Record<string, unknown>).status = { $in: filter.status };
        } else {
          query.status = filter.status;
        }
      }

      const assets = await collection.find(query).sort({ jobId: 1, sceneId: 1, type: 1, label: 1 }).toArray();
      return assets.map(stripMongoDocument);
    },

    async patch(id: string, patch: ProductionAssetPatchInput): Promise<ProductionAsset | null> {
      const update = normalizeProductionAssetPatch(patch);

      if (Object.keys(update).length === 0) {
        return this.findById(id);
      }

      const updatedAt = new Date().toISOString();
      const set = { ...update, updatedAt } as Document;
      const result = await collection.findOneAndUpdate(
        { _id: id } as Filter<ProductionAssetDocument>,
        { $set: set },
        { returnDocument: "after" }
      );

      return result ? stripMongoDocument(result) : null;
    },

    async upsertByPlanningKey(input: ProductionAssetCreateInput): Promise<{ asset: ProductionAsset; created: boolean }> {
      await this.ensureIndexes();

      const now = new Date().toISOString();
      const normalizedInput = normalizeProductionAssetCreateInput(input, now);
      const query = {
        jobId: normalizedInput.jobId,
        sceneId: normalizedInput.sceneId,
        type: normalizedInput.type
      } as Filter<ProductionAssetDocument>;
      const existing = await collection.findOne(query);

      if (existing) {
        const patch = normalizeProductionAssetPatch({
          ...normalizedInput,
          status: existing.status === "planned" ? normalizedInput.status : existing.status
        });
        const set = { ...patch, updatedAt: now } as Document;
        const result = await collection.findOneAndUpdate(query, { $set: set }, { returnDocument: "after" });
        return {
          asset: stripMongoDocument(result ?? existing),
          created: false
        };
      }

      const asset = normalizeProductionAsset({
        ...normalizedInput,
        id: input.id
      }, now);
      await collection.insertOne(asset as ProductionAssetDocument);

      return {
        asset,
        created: true
      };
    }
  };
}

function buildPlannedProductionAssets(input: BootstrapProductionAssetsInput): ProductionAssetCreateInput[] {
  const sceneCount = Math.max(1, Math.min(20, Math.round(input.sceneCount)));
  const basePrompt = input.prompt?.trim() || `Asset plan for ${input.topic}`;
  const sceneAssets = Array.from({ length: sceneCount }, (_, index): ProductionAssetCreateInput => {
    const sceneId = index + 1;

    return {
      jobId: input.jobId,
      label: `Scene ${sceneId} first frame`,
      folderName: `Case ${input.jobId}`,
      prompt: `${basePrompt}\nCreate the approved first-frame still for scene ${sceneId}.`,
      provider: "openai",
      role: "first_frame",
      sceneId,
      scope: "scene",
      status: "planned",
      type: "first_frame"
    };
  });
  const optionalLastFrames = input.includeLastFrames
    ? Array.from({ length: sceneCount }, (_, index): ProductionAssetCreateInput => {
      const sceneId = index + 1;
      return {
        jobId: input.jobId,
        label: `Scene ${sceneId} last frame`,
        folderName: `Case ${input.jobId}`,
        prompt: `${basePrompt}\nCreate the optional last-frame still for scene ${sceneId}.`,
        provider: "openai",
        role: "last_frame",
        sceneId,
        scope: "scene",
        status: "planned",
        type: "last_frame"
      };
    })
    : [];

  return [
    {
      jobId: input.jobId,
      label: "Character design",
      folderName: `Case ${input.jobId}`,
      prompt: `${basePrompt}\nCreate the locked character three-view design reference for this case: front, side, and back full-body views of the same fictional adult character.`,
      provider: "openai",
      role: "reference_image",
      sceneId: null,
      scope: "case",
      status: "planned",
      type: "character_design"
    },
    {
      jobId: input.jobId,
      label: "Scene design",
      folderName: `Case ${input.jobId}`,
      prompt: `${basePrompt}\nCreate the reusable environment bible sheet for this case: same location across multiple angles, unlabeled spatial relationship, entrance/camera path, key prop close-ups, material details, lighting direction, color palette, and reusable camera positions.`,
      provider: "openai",
      role: "reference_image",
      sceneId: null,
      scope: "case",
      status: "planned",
      type: "scene_design"
    },
    {
      jobId: input.jobId,
      label: "Style reference",
      folderName: `Case ${input.jobId}`,
      prompt: `${basePrompt}\nDefine the reusable visual style reference for this case.`,
      provider: "openai",
      role: "reference_image",
      sceneId: null,
      scope: "case",
      status: "planned",
      type: "style_reference"
    },
    ...sceneAssets,
    ...optionalLastFrames
  ];
}

function normalizeProductionAsset(input: ProductionAssetCreateInput, now = new Date().toISOString()): ProductionAsset {
  const normalized = normalizeProductionAssetCreateInput(input, now);

  return {
    _id: input.id ?? createProductionAssetRecordId(),
    ...normalized,
    createdAt: now,
    updatedAt: now
  };
}

function normalizeProductionAssetCreateInput(input: ProductionAssetCreateInput, _now = new Date().toISOString()): Omit<ProductionAsset, "_id" | "createdAt" | "updatedAt"> {
  const sceneId = input.sceneId === undefined || input.sceneId === null ? null : Math.max(1, Math.round(Number(input.sceneId) || 1));
  const type = normalizeProductionAssetType(input.type);
  const role = normalizeProductionAssetRole(input.role ?? defaultRoleForAssetType(type));

  return {
    costRM: numberOrDefault(input.costRM, 0),
    error: input.error ?? "",
    folderName: normalizeFolderName(input.folderName),
    jobId: input.jobId.trim(),
    label: input.label.trim() || defaultAssetLabel(type, sceneId),
    notes: input.notes ?? "",
    prompt: input.prompt ?? "",
    provider: normalizeProductionAssetProvider(input.provider ?? "manual"),
    role,
    sceneId,
    scope: input.scope ?? (sceneId ? "scene" : "case"),
    status: normalizeProductionAssetStatus(input.status ?? "planned"),
    storagePath: input.storagePath ?? "",
    tags: normalizeTags(input.tags),
    type,
    url: input.url ?? ""
  };
}

function normalizeProductionAssetPatch(patch: ProductionAssetPatchInput): ProductionAssetPatchInput {
  const normalized: ProductionAssetPatchInput = {};

  if (patch.costRM !== undefined) normalized.costRM = numberOrDefault(patch.costRM, 0);
  if (patch.error !== undefined) normalized.error = patch.error;
  if (patch.folderName !== undefined) normalized.folderName = normalizeFolderName(patch.folderName);
  if (patch.label !== undefined) normalized.label = patch.label;
  if (patch.notes !== undefined) normalized.notes = patch.notes;
  if (patch.prompt !== undefined) normalized.prompt = patch.prompt;
  if (patch.provider !== undefined) normalized.provider = normalizeProductionAssetProvider(patch.provider);
  if (patch.role !== undefined) normalized.role = normalizeProductionAssetRole(patch.role);
  if (patch.sceneId !== undefined) normalized.sceneId = patch.sceneId === null ? null : Math.max(1, Math.round(Number(patch.sceneId) || 1));
  if (patch.scope !== undefined) normalized.scope = patch.scope === "scene" ? "scene" : "case";
  if (patch.status !== undefined) normalized.status = normalizeProductionAssetStatus(patch.status);
  if (patch.storagePath !== undefined) normalized.storagePath = patch.storagePath;
  if (patch.tags !== undefined) normalized.tags = normalizeTags(patch.tags);
  if (patch.type !== undefined) normalized.type = normalizeProductionAssetType(patch.type);
  if (patch.url !== undefined) normalized.url = patch.url;

  return normalized;
}

function stripMongoDocument(asset: ProductionAssetDocument): ProductionAsset {
  return {
    _id: String(asset._id),
    costRM: numberOrDefault(asset.costRM, 0),
    createdAt: asset.createdAt,
    error: asset.error ?? "",
    folderName: normalizeFolderName(asset.folderName),
    jobId: asset.jobId,
    label: asset.label,
    notes: asset.notes ?? "",
    prompt: asset.prompt ?? "",
    provider: normalizeProductionAssetProvider(asset.provider),
    role: normalizeProductionAssetRole(asset.role),
    sceneId: asset.sceneId ?? null,
    scope: asset.scope === "scene" ? "scene" : "case",
    status: normalizeProductionAssetStatus(asset.status),
    storagePath: asset.storagePath ?? "",
    tags: normalizeTags(asset.tags),
    type: normalizeProductionAssetType(asset.type),
    updatedAt: asset.updatedAt,
    url: asset.url ?? ""
  };
}

function createProductionAssetRecordId(): string {
  return `production_asset_${randomUUID()}`;
}

function defaultAssetLabel(type: ProductionAssetType, sceneId: number | null): string {
  const prefix = sceneId ? `Scene ${sceneId} ` : "";
  const labels: Record<ProductionAssetType, string> = {
    bgm_reference: "BGM reference",
    character_design: "Character design",
    first_frame: "First frame",
    last_frame: "Last frame",
    scene_design: "Scene design",
    style_reference: "Style reference"
  };

  return `${prefix}${labels[type]}`.trim();
}

function defaultRoleForAssetType(type: ProductionAssetType): ProductionAssetRole {
  if (type === "first_frame") return "first_frame";
  if (type === "last_frame") return "last_frame";
  if (type === "bgm_reference") return "bgm_reference";
  if (type === "character_design" || type === "scene_design" || type === "style_reference") return "reference_image";
  return "none";
}

function normalizeProductionAssetType(value: string): ProductionAssetType {
  return value === "scene_design" || value === "style_reference" || value === "first_frame" || value === "last_frame" || value === "bgm_reference" ? value : "character_design";
}

function normalizeProductionAssetStatus(value: string): ProductionAssetStatus {
  return value === "generating" || value === "ready" || value === "approved" || value === "rejected" || value === "failed" ? value : "planned";
}

function normalizeProductionAssetProvider(value: string): ProductionAssetProvider {
  return value === "openai" || value === "seedance" || value === "elevenlabs" || value === "local" ? value : "manual";
}

function normalizeProductionAssetRole(value: string): ProductionAssetRole {
  return value === "first_frame" || value === "last_frame" || value === "bgm_reference" || value === "none" ? value : "reference_image";
}

function normalizeContentSeries(input: ContentSeriesCreateInput, now = new Date().toISOString()): ContentSeries {
  return {
    _id: input.id ?? `series_${randomUUID()}`,
    audience: normalizeText(input.audience, "未指定目标观众"),
    contentType: normalizeText(input.contentType, "自定义内容类型"),
    createdAt: now,
    description: normalizeText(input.description, ""),
    durationSeconds: Math.max(15, Math.min(180, Math.round(numberOrDefault(input.durationSeconds, 45)))),
    language: normalizeSeriesLanguage(input.language),
    musicStyle: normalizeText(input.musicStyle, ""),
    name: normalizeText(input.name, "未命名系列"),
    referenceAssetIds: normalizeStringList(input.referenceAssetIds, 50),
    safetyRules: normalizeText(
      input.safetyRules,
      "遵守平台与项目基础合规：原创、不抄袭、不使用版权角色、不伪造真实人物、不包含露骨性内容或血腥 gore；具体限制由系列设定补充。"
    ),
    sceneCount: Math.max(3, Math.min(12, Math.round(numberOrDefault(input.sceneCount, 5)))),
    status: normalizeContentSeriesStatus(input.status ?? "draft"),
    storyWorldId: normalizeNullableText(input.storyWorldId),
    tone: normalizeText(input.tone, ""),
    updatedAt: now,
    values: normalizeText(input.values, ""),
    visualStyle: normalizeText(input.visualStyle, "")
  };
}

function normalizeContentSeriesPatch(patch: ContentSeriesPatchInput): ContentSeriesPatchInput {
  const normalized: ContentSeriesPatchInput = {};

  if (patch.audience !== undefined) normalized.audience = normalizeText(patch.audience, "");
  if (patch.contentType !== undefined) normalized.contentType = normalizeText(patch.contentType, "");
  if (patch.description !== undefined) normalized.description = normalizeText(patch.description, "");
  if (patch.durationSeconds !== undefined) normalized.durationSeconds = Math.max(15, Math.min(180, Math.round(numberOrDefault(patch.durationSeconds, 45))));
  if (patch.language !== undefined) normalized.language = normalizeSeriesLanguage(patch.language);
  if (patch.musicStyle !== undefined) normalized.musicStyle = normalizeText(patch.musicStyle, "");
  if (patch.name !== undefined) normalized.name = normalizeText(patch.name, "未命名系列");
  if (patch.referenceAssetIds !== undefined) normalized.referenceAssetIds = normalizeStringList(patch.referenceAssetIds, 50);
  if (patch.safetyRules !== undefined) normalized.safetyRules = normalizeText(patch.safetyRules, "");
  if (patch.sceneCount !== undefined) normalized.sceneCount = Math.max(3, Math.min(12, Math.round(numberOrDefault(patch.sceneCount, 5))));
  if (patch.status !== undefined) normalized.status = normalizeContentSeriesStatus(patch.status);
  if (patch.storyWorldId !== undefined) normalized.storyWorldId = normalizeNullableText(patch.storyWorldId);
  if (patch.tone !== undefined) normalized.tone = normalizeText(patch.tone, "");
  if (patch.values !== undefined) normalized.values = normalizeText(patch.values, "");
  if (patch.visualStyle !== undefined) normalized.visualStyle = normalizeText(patch.visualStyle, "");

  return normalized;
}

function normalizeSeriesEpisodeIdea(input: SeriesEpisodeIdeaCreateInput, now = new Date().toISOString()): SeriesEpisodeIdea {
  return {
    _id: input.id ?? `episode_${randomUUID()}`,
    ageRange: normalizeText(input.ageRange, ""),
    caseId: input.caseId === undefined || input.caseId === null ? null : normalizeText(input.caseId, ""),
    createdAt: now,
    episodeNo: input.episodeNo === undefined || input.episodeNo === null ? null : Math.max(1, Math.round(numberOrDefault(input.episodeNo, 1))),
    interactiveEnding: normalizeText(input.interactiveEnding, ""),
    lessonOrTheme: normalizeText(input.lessonOrTheme, input.moralLesson),
    moralLesson: normalizeText(input.moralLesson, "核心看点待补充"),
    promptSeed: normalizeText(input.promptSeed, input.synopsis),
    riskNotes: normalizeText(input.riskNotes, "按系列安全规则复核。"),
    selectedCharacterAssetIds: normalizeStringList(input.selectedCharacterAssetIds, 20),
    selectedSceneAssetIds: normalizeStringList(input.selectedSceneAssetIds, 20),
    seriesId: normalizeText(input.seriesId, ""),
    sourceStory: normalizeText(input.sourceStory, "原创灵感"),
    status: normalizeSeriesEpisodeIdeaStatus(input.status ?? "draft"),
    synopsis: normalizeText(input.synopsis, ""),
    title: normalizeText(input.title, "未命名单集"),
    updatedAt: now
  };
}

function normalizeSeriesEpisodeIdeaPatch(patch: SeriesEpisodeIdeaPatchInput): SeriesEpisodeIdeaPatchInput {
  const normalized: SeriesEpisodeIdeaPatchInput = {};

  if (patch.ageRange !== undefined) normalized.ageRange = normalizeText(patch.ageRange, "");
  if (patch.caseId !== undefined) normalized.caseId = patch.caseId === null ? null : normalizeText(patch.caseId, "");
  if (patch.episodeNo !== undefined) normalized.episodeNo = patch.episodeNo === null ? null : Math.max(1, Math.round(numberOrDefault(patch.episodeNo, 1)));
  if (patch.interactiveEnding !== undefined) normalized.interactiveEnding = normalizeText(patch.interactiveEnding, "");
  if (patch.lessonOrTheme !== undefined) normalized.lessonOrTheme = normalizeText(patch.lessonOrTheme, "");
  if (patch.moralLesson !== undefined) normalized.moralLesson = normalizeText(patch.moralLesson, "");
  if (patch.promptSeed !== undefined) normalized.promptSeed = normalizeText(patch.promptSeed, "");
  if (patch.riskNotes !== undefined) normalized.riskNotes = normalizeText(patch.riskNotes, "");
  if (patch.selectedCharacterAssetIds !== undefined) normalized.selectedCharacterAssetIds = normalizeStringList(patch.selectedCharacterAssetIds, 20);
  if (patch.selectedSceneAssetIds !== undefined) normalized.selectedSceneAssetIds = normalizeStringList(patch.selectedSceneAssetIds, 20);
  if (patch.sourceStory !== undefined) normalized.sourceStory = normalizeText(patch.sourceStory, "");
  if (patch.status !== undefined) normalized.status = normalizeSeriesEpisodeIdeaStatus(patch.status);
  if (patch.synopsis !== undefined) normalized.synopsis = normalizeText(patch.synopsis, "");
  if (patch.title !== undefined) normalized.title = normalizeText(patch.title, "未命名单集");

  return normalized;
}

function stripContentSeriesDocument(series: ContentSeriesDocument): ContentSeries {
  const normalized = normalizeContentSeries({
    audience: series.audience,
    contentType: series.contentType,
    description: series.description,
    durationSeconds: series.durationSeconds,
    id: String(series._id),
    language: normalizeSeriesLanguage(series.language),
    musicStyle: series.musicStyle,
    name: series.name,
    referenceAssetIds: normalizeStringList(series.referenceAssetIds, 50),
    safetyRules: series.safetyRules,
    sceneCount: series.sceneCount,
    status: normalizeContentSeriesStatus(series.status),
    storyWorldId: series.storyWorldId ?? null,
    tone: series.tone,
    values: series.values,
    visualStyle: series.visualStyle
  }, series.createdAt);

  return {
    ...normalized,
    updatedAt: series.updatedAt ?? normalized.updatedAt
  };
}

function stripSeriesEpisodeIdeaDocument(episode: SeriesEpisodeIdeaDocument): SeriesEpisodeIdea {
  const normalized = normalizeSeriesEpisodeIdea({
    ageRange: episode.ageRange,
    caseId: episode.caseId ?? null,
    episodeNo: episode.episodeNo ?? null,
    id: String(episode._id),
    interactiveEnding: episode.interactiveEnding,
    lessonOrTheme: episode.lessonOrTheme,
    moralLesson: episode.moralLesson,
    promptSeed: episode.promptSeed,
    riskNotes: episode.riskNotes,
    selectedCharacterAssetIds: normalizeStringList(episode.selectedCharacterAssetIds, 20),
    selectedSceneAssetIds: normalizeStringList(episode.selectedSceneAssetIds, 20),
    seriesId: episode.seriesId,
    sourceStory: episode.sourceStory,
    status: normalizeSeriesEpisodeIdeaStatus(episode.status),
    synopsis: episode.synopsis,
    title: episode.title
  }, episode.createdAt);

  return {
    ...normalized,
    updatedAt: episode.updatedAt ?? normalized.updatedAt
  };
}

function normalizeStoryWorld(input: StoryWorldCreateInput, now = new Date().toISOString()): StoryWorld {
  return {
    _id: input.id ?? `world_${randomUUID()}`,
    createdAt: now,
    defaultSceneAssetIds: normalizeStringList(input.defaultSceneAssetIds, 50),
    description: normalizeText(input.description, ""),
    name: normalizeText(input.name, "未命名世界观"),
    recurringCharacterAssetIds: normalizeStringList(input.recurringCharacterAssetIds, 50),
    relationshipMap: normalizeText(input.relationshipMap, ""),
    safetyRules: normalizeText(input.safetyRules, ""),
    seriesIds: normalizeStringList(input.seriesIds, 50),
    status: normalizeStoryWorldStatus(input.status ?? "draft"),
    updatedAt: now,
    visualStyle: normalizeText(input.visualStyle, "")
  };
}

function normalizeStoryWorldPatch(patch: StoryWorldPatchInput): StoryWorldPatchInput {
  const normalized: StoryWorldPatchInput = {};

  if (patch.defaultSceneAssetIds !== undefined) normalized.defaultSceneAssetIds = normalizeStringList(patch.defaultSceneAssetIds, 50);
  if (patch.description !== undefined) normalized.description = normalizeText(patch.description, "");
  if (patch.name !== undefined) normalized.name = normalizeText(patch.name, "未命名世界观");
  if (patch.recurringCharacterAssetIds !== undefined) normalized.recurringCharacterAssetIds = normalizeStringList(patch.recurringCharacterAssetIds, 50);
  if (patch.relationshipMap !== undefined) normalized.relationshipMap = normalizeText(patch.relationshipMap, "");
  if (patch.safetyRules !== undefined) normalized.safetyRules = normalizeText(patch.safetyRules, "");
  if (patch.seriesIds !== undefined) normalized.seriesIds = normalizeStringList(patch.seriesIds, 50);
  if (patch.status !== undefined) normalized.status = normalizeStoryWorldStatus(patch.status);
  if (patch.visualStyle !== undefined) normalized.visualStyle = normalizeText(patch.visualStyle, "");

  return normalized;
}

function stripStoryWorldDocument(storyWorld: StoryWorldDocument): StoryWorld {
  const normalized = normalizeStoryWorld({
    defaultSceneAssetIds: normalizeStringList(storyWorld.defaultSceneAssetIds, 50),
    description: storyWorld.description,
    id: String(storyWorld._id),
    name: storyWorld.name,
    recurringCharacterAssetIds: normalizeStringList(storyWorld.recurringCharacterAssetIds, 50),
    relationshipMap: storyWorld.relationshipMap,
    safetyRules: storyWorld.safetyRules,
    seriesIds: normalizeStringList(storyWorld.seriesIds, 50),
    status: normalizeStoryWorldStatus(storyWorld.status),
    visualStyle: storyWorld.visualStyle
  }, storyWorld.createdAt);

  return {
    ...normalized,
    updatedAt: storyWorld.updatedAt ?? normalized.updatedAt
  };
}

function normalizeContentSeriesStatus(value: string): ContentSeriesStatus {
  if (value === "active" || value === "paused" || value === "archived") {
    return value;
  }

  return "draft";
}

function normalizeStoryWorldStatus(value: string): StoryWorld["status"] {
  if (value === "active" || value === "archived") {
    return value;
  }

  return "draft";
}

function normalizeSeriesEpisodeIdeaStatus(value: string): SeriesEpisodeIdeaStatus {
  if (value === "approved" || value === "converted_to_case" || value === "rejected") {
    return value;
  }

  return "draft";
}

function normalizeSeriesLanguage(value: unknown): ContentSeries["language"] {
  return value === "en-US" ? "en-US" : "zh-CN";
}

function normalizeText(value: unknown, fallback: string): string {
  return typeof value === "string" && value.trim() ? value.trim() : fallback;
}

function normalizeNullableText(value: unknown): string | null {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function normalizeStringList(value: unknown, limit: number): string[] {
  if (!Array.isArray(value)) {
    return [];
  }

  return value
    .filter((item): item is string => typeof item === "string" && item.trim().length > 0)
    .map((item) => item.trim())
    .filter((item, index, items) => items.indexOf(item) === index)
    .slice(0, limit);
}

function normalizeCostLog(input: CostLogCreateInput, now = new Date().toISOString()): CostLog {
  const costRM = round4(numberOrDefault(input.costRM, 0));
  const exchangeRate = numberOrDefault(input.exchangeRate, 0);
  const costUSD = input.costUSD === undefined
    ? exchangeRate > 0 ? round6(costRM / exchangeRate) : 0
    : round6(numberOrDefault(input.costUSD, 0));

  return {
    _id: input.id ?? `cost_${randomUUID()}`,
    costRM,
    costUSD,
    createdAt: now,
    currency: "MYR",
    exchangeRate,
    jobId: input.jobId.trim() || "unknown_job",
    model: input.model.trim() || "unknown_model",
    operation: input.operation.trim() || input.service,
    provider: normalizeCostProvider(input.provider),
    pricingSource: input.pricingSource.trim() || "unspecified",
    pricingStatus: normalizePricingStatus(input.pricingStatus),
    quantity: round6(numberOrDefault(input.quantity, 0)),
    service: normalizeCostService(input.service),
    toolType: normalizeCostToolType(input.toolType, input.service),
    unit: input.unit.trim() || "unit",
    usage: normalizeCostUsage(input.usage)
  };
}

function stripCostLogDocument(log: CostLogDocument): CostLog {
  return normalizeCostLog({
    costRM: numberOrDefault(log.costRM, 0),
    costUSD: numberOrDefault(log.costUSD, 0),
    exchangeRate: numberOrDefault(log.exchangeRate, 0),
    id: String(log._id),
    jobId: log.jobId,
    model: log.model,
    operation: log.operation,
    provider: normalizeCostProvider(log.provider),
    pricingSource: log.pricingSource,
    pricingStatus: normalizePricingStatus(log.pricingStatus),
    quantity: numberOrDefault(log.quantity, 0),
    service: normalizeCostService(log.service),
    toolType: normalizeCostToolType(log.toolType, log.service),
    unit: log.unit,
    usage: normalizeCostUsage(log.usage)
  }, log.createdAt);
}

function normalizeCostProvider(value: string): CostLog["provider"] {
  return value.trim() || "unknown_provider";
}

function normalizeCostService(value: string): CostLog["service"] {
  if (value === "script" || value === "image" || value === "reference_design" || value === "tts" || value === "bgm" || value === "video" || value === "compose" || value === "qc") {
    return value;
  }

  return "other";
}

function normalizeCostToolType(value: string | undefined, service: string): CostLogToolType {
  if (
    value === "llm" ||
    value === "image" ||
    value === "design_image" ||
    value === "tts" ||
    value === "bgm" ||
    value === "video" ||
    value === "subtitle" ||
    value === "compose" ||
    value === "storage" ||
    value === "youtube"
  ) {
    return value;
  }

  if (service === "script") return "llm";
  if (service === "reference_design") return "design_image";
  if (service === "image") return "image";
  if (service === "tts") return "tts";
  if (service === "bgm") return "bgm";
  if (service === "video") return "video";
  if (service === "compose") return "compose";

  return "other";
}

function normalizePricingStatus(value: string): CostLogPricingStatus {
  if (value === "actual_usage" || value === "configured_rate" || value === "local_zero") {
    return value;
  }

  return "pricing_missing";
}

function normalizeCostUsage(value: CostLogUsage | undefined): CostLogUsage {
  const usage: CostLogUsage = {};

  if (!value || typeof value !== "object") {
    return usage;
  }

  Object.entries(value).forEach(([key, item]) => {
    if (typeof item === "string" || typeof item === "number" || typeof item === "boolean" || item === null) {
      usage[key] = item;
    }
  });

  return usage;
}

function sumCostsBy(logs: CostLog[], field: "provider" | "service"): Array<Record<string, string | number>> {
  const totals = new Map<string, number>();

  logs.forEach((log) => totals.set(log[field], (totals.get(log[field]) ?? 0) + log.costRM));
  return [...totals.entries()]
    .map(([key, costRM]) => ({ [field]: key, costRM: round4(costRM) }))
    .sort((left, right) => Number(right.costRM) - Number(left.costRM));
}

function normalizeFolderName(value: unknown): string {
  return typeof value === "string" && value.trim() ? value.trim() : "未分类";
}

function normalizeTags(value: unknown): string[] {
  if (!Array.isArray(value)) {
    return [];
  }

  return value
    .filter((item): item is string => typeof item === "string" && item.trim().length > 0)
    .map((item) => item.trim())
    .filter((item, index, items) => items.indexOf(item) === index)
    .slice(0, 20);
}

function numberOrDefault(value: number | undefined, fallback: number): number {
  return Number.isFinite(value) ? Number(value) : fallback;
}

function round4(value: number): number {
  return Number(value.toFixed(4));
}

function round6(value: number): number {
  return Number(value.toFixed(6));
}
