import { describe, expect, it, vi } from "vitest";
import type { MongoClient } from "mongodb";
import { connectMongoDatabase, createAppStateRepository, createContentSeriesRepository, createProductionAssetsRepository, createStoryWorldsRepository, getDatabaseNameFromMongoUri, type MongoDatabaseConnection } from "./index.js";

describe("getDatabaseNameFromMongoUri", () => {
  it("reads the database name from a MongoDB URI", () => {
    expect(getDatabaseNameFromMongoUri("mongodb://localhost:27017/ai_content_factory")).toBe("ai_content_factory");
    expect(getDatabaseNameFromMongoUri("mongodb+srv://user:pass@example.mongodb.net/content_ops?retryWrites=true")).toBe("content_ops");
  });

  it("falls back when the URI has no database name", () => {
    expect(getDatabaseNameFromMongoUri("mongodb://localhost:27017")).toBe("ai_content_factory");
  });
});

describe("connectMongoDatabase", () => {
  it("connects through an injectable MongoClient factory", async () => {
    const command = vi.fn().mockResolvedValue({ ok: 1 });
    const close = vi.fn().mockResolvedValue(undefined);
    const connect = vi.fn().mockResolvedValue(undefined);
    const collection = vi.fn();
    const db = vi.fn().mockReturnValue({
      collection,
      command,
      databaseName: "ai_content_factory"
    });
    const client = {
      close,
      connect,
      db
    } as unknown as MongoClient;
    const factory = vi.fn().mockReturnValue(client);

    const connection = await connectMongoDatabase(
      {
        mongoUri: "mongodb://localhost:27017/ai_content_factory",
        serverSelectionTimeoutMS: 100
      },
      factory
    );

    await expect(connection.ping()).resolves.toEqual({
      databaseName: "ai_content_factory",
      ok: true
    });
    await connection.close();

    expect(factory).toHaveBeenCalledWith(
      "mongodb://localhost:27017/ai_content_factory",
      expect.objectContaining({
        appName: "ai-content-factory",
        serverSelectionTimeoutMS: 100
      })
    );
    expect(connect).toHaveBeenCalledOnce();
    expect(db).toHaveBeenCalledWith("ai_content_factory");
    expect(close).toHaveBeenCalledOnce();
  });
});

describe("appStateRepository", () => {
  it("upserts and lists app state by key prefix", async () => {
    const fakeCollection = createFakeProductionAssetsCollection();
    const repository = createAppStateRepository({
      collection: () => fakeCollection
    } as unknown as MongoDatabaseConnection);

    await repository.upsert("ai-content-factory:admin-jobs", JSON.stringify([{ id: "job_001" }]));
    await repository.upsert("other-app:key", "ignore");
    await repository.upsert("ai-content-factory:budget-settings", JSON.stringify({ defaultCaseBudgetRM: 30 }));
    await repository.upsert("ai-content-factory:budget-settings", JSON.stringify({ defaultCaseBudgetRM: 50 }));

    const entries = await repository.list("ai-content-factory:");

    expect(entries.map((entry) => entry.key)).toEqual(["ai-content-factory:admin-jobs", "ai-content-factory:budget-settings"]);
    expect(JSON.parse(entries.find((entry) => entry.key === "ai-content-factory:budget-settings")?.value ?? "{}")).toEqual({
      defaultCaseBudgetRM: 50
    });
    expect(fakeCollection.createIndex).toHaveBeenCalledWith({ key: 1 }, { unique: true });
  });
});

describe("productionAssetsRepository", () => {
  it("bootstraps case asset plans idempotently", async () => {
    const fakeCollection = createFakeProductionAssetsCollection();
    const repository = createProductionAssetsRepository({
      collection: () => fakeCollection
    } as unknown as MongoDatabaseConnection);

    const first = await repository.bootstrapCase({
      jobId: "job_001",
      sceneCount: 2,
      topic: "rainy convenience store"
    });
    const second = await repository.bootstrapCase({
      jobId: "job_001",
      sceneCount: 2,
      topic: "rainy convenience store"
    });

    expect(first.created).toBe(5);
    expect(second.created).toBe(0);
    expect(second.assets).toHaveLength(5);
    expect(fakeCollection.createIndex).toHaveBeenCalled();
    expect(fakeCollection.documents()).toHaveLength(5);
  });

  it("creates, lists, patches, and deletes production assets", async () => {
    const fakeCollection = createFakeProductionAssetsCollection();
    const repository = createProductionAssetsRepository({
      collection: () => fakeCollection
    } as unknown as MongoDatabaseConnection);

    const created = await repository.create({
      jobId: "job_002",
      label: "Character design",
      provider: "openai",
      role: "reference_image",
      status: "planned",
      type: "character_design"
    });
    const listed = await repository.list({ jobId: "job_002" });
    const patched = await repository.patch(created._id, {
      status: "approved",
      url: "https://cdn.example.test/character.png"
    });
    const approved = await repository.list({ status: ["approved"] });
    const deleted = await repository.delete(created._id);

    expect(listed).toHaveLength(1);
    expect(patched?.status).toBe("approved");
    expect(patched?.url).toBe("https://cdn.example.test/character.png");
    expect(approved.map((asset) => asset._id)).toEqual([created._id]);
    expect(deleted).toBe(true);
    expect(await repository.findById(created._id)).toBeNull();
  });

  it("creates unique records for repeated library design assets", async () => {
    const fakeCollection = createFakeProductionAssetsCollection();
    const repository = createProductionAssetsRepository({
      collection: () => fakeCollection
    } as unknown as MongoDatabaseConnection);

    const first = await repository.create({
      jobId: "asset_library",
      label: "Character design A",
      provider: "openai",
      role: "reference_image",
      status: "planned",
      type: "character_design"
    });
    const second = await repository.create({
      jobId: "asset_library",
      label: "Character design B",
      provider: "openai",
      role: "reference_image",
      status: "planned",
      type: "character_design"
    });

    expect(first._id).not.toBe(second._id);
    expect(await repository.list({ jobId: "asset_library", type: "character_design" })).toHaveLength(2);
  });
});

describe("contentSeriesRepository", () => {
  it("creates, patches, lists, and deletes series with episode ideas", async () => {
    const seriesCollection = createFakeProductionAssetsCollection();
    const episodesCollection = createFakeProductionAssetsCollection();
    const repository = createContentSeriesRepository({
      collection: (name: string) => name === "content_series" ? seriesCollection : episodesCollection
    } as unknown as MongoDatabaseConnection);

    const series = await repository.createSeries({
      contentType: "AI 工具科普",
      name: "AI 工具实战系列",
      values: "实用、可信、可落地"
    });
    const patched = await repository.patchSeries(series._id, {
      status: "active",
      tone: "专业、清楚、有案例感"
    });
    const episodes = await repository.createEpisodeIdeas(series._id, [
      {
        moralLesson: "理解 AI 自动化的真实边界",
        promptSeed: "小团队误用自动化导致内容出错，最后建立人工审核节点。",
        sourceStory: "原创商业场景",
        synopsis: "团队从盲目自动化改成关键节点审核，效率和质量都提升。",
        title: "自动化不是全自动"
      }
    ]);
    const approved = await repository.patchEpisodeIdea(series._id, episodes[0]!._id, { status: "approved" });
    const listedBeforeDelete = await repository.listSeries();
    const episodeListBeforeDelete = await repository.listEpisodeIdeas(series._id);
    const deleted = await repository.deleteSeries(series._id);

    expect(patched?.status).toBe("active");
    expect(listedBeforeDelete).toHaveLength(1);
    expect(episodeListBeforeDelete).toHaveLength(1);
    expect(approved?.status).toBe("approved");
    expect(deleted).toBe(true);
    expect(await repository.listEpisodeIdeas(series._id)).toHaveLength(0);
  });

  it("uses generic defaults instead of forcing a specific channel type", async () => {
    const seriesCollection = createFakeProductionAssetsCollection();
    const episodesCollection = createFakeProductionAssetsCollection();
    const repository = createContentSeriesRepository({
      collection: (name: string) => name === "content_series" ? seriesCollection : episodesCollection
    } as unknown as MongoDatabaseConnection);

    const series = await repository.createSeries({ name: "新系列" });

    expect(series.audience).toBe("未指定目标观众");
    expect(series.contentType).toBe("自定义内容类型");
    expect(series.description).toBe("");
    expect(series.tone).toBe("");
    expect(series.visualStyle).toBe("");
  });
});

describe("storyWorldsRepository", () => {
  it("creates, patches, lists, and deletes reusable story worlds", async () => {
    const storyWorldsCollection = createFakeProductionAssetsCollection();
    const repository = createStoryWorldsRepository({
      collection: () => storyWorldsCollection
    } as unknown as MongoDatabaseConnection);

    const created = await repository.create({
      defaultSceneAssetIds: ["asset_rainbow_forest"],
      description: "ä¸€ä¸ªå¯é‡ç”¨çš„å½©è™¹æ£®æž—ä¸–ç•Œè§‚ã€‚",
      name: "å½©è™¹æ£®æž—",
      recurringCharacterAssetIds: ["asset_rabbit"],
      seriesIds: ["series_story"],
      status: "active",
      visualStyle: "æŸ”å’Œç«¥è¯é£Žæ ¼"
    });
    const patched = await repository.patch(created._id, {
      relationshipMap: "å…”å­ç±³ç±³å’Œæ£®æž—åŒå­¦ä¸€èµ·ä¸Šè¯¾ã€‚"
    });
    const listed = await repository.list();
    const deleted = await repository.delete(created._id);

    expect(created.defaultSceneAssetIds).toEqual(["asset_rainbow_forest"]);
    expect(created.recurringCharacterAssetIds).toEqual(["asset_rabbit"]);
    expect(patched?.relationshipMap).toContain("ç±³ç±³");
    expect(listed).toHaveLength(1);
    expect(deleted).toBe(true);
  });
});

function createFakeProductionAssetsCollection() {
  const documents = new Map<string, Record<string, unknown>>();
  const collection = {
    createIndex: vi.fn().mockResolvedValue("index"),
    deleteOne: vi.fn(async (query: Record<string, unknown>) => {
      const document = [...documents.values()].find((candidate) => matchesQuery(candidate, query));

      if (!document) {
        return { deletedCount: 0 };
      }

      documents.delete(String(document._id));
      return { deletedCount: 1 };
    }),
    deleteMany: vi.fn(async (query: Record<string, unknown>) => {
      const matching = [...documents.values()].filter((candidate) => matchesQuery(candidate, query));
      matching.forEach((document) => documents.delete(String(document._id)));
      return { deletedCount: matching.length };
    }),
    documents: () => [...documents.values()],
    find: vi.fn((query: Record<string, unknown>) => ({
      sort: vi.fn(() => ({
        toArray: vi.fn(async () => [...documents.values()].filter((document) => matchesQuery(document, query)))
      }))
    })),
    findOne: vi.fn(async (query: Record<string, unknown>) => [...documents.values()].find((document) => matchesQuery(document, query)) ?? null),
    findOneAndUpdate: vi.fn(async (query: Record<string, unknown>, update: { $set?: Record<string, unknown> }) => {
      const document = [...documents.values()].find((candidate) => matchesQuery(candidate, query));

      if (!document) {
        return null;
      }

      Object.assign(document, update.$set ?? {});
      documents.set(String(document._id), document);
      return document;
    }),
    insertOne: vi.fn(async (document: Record<string, unknown>) => {
      documents.set(String(document._id), { ...document });
      return { insertedId: document._id };
    }),
    insertMany: vi.fn(async (items: Array<Record<string, unknown>>) => {
      items.forEach((document) => documents.set(String(document._id), { ...document }));
      return { insertedCount: items.length, insertedIds: Object.fromEntries(items.map((item, index) => [index, item._id])) };
    })
  };

  return collection;
}

function matchesQuery(document: Record<string, unknown>, query: Record<string, unknown>): boolean {
  return Object.entries(query).every(([key, value]) => {
    if (isInFilter(value)) {
      return value.$in.includes(document[key] as never);
    }

    if (isRegexFilter(value)) {
      return new RegExp(value.$regex).test(String(document[key] ?? ""));
    }

    return document[key] === value;
  });
}

function isInFilter(value: unknown): value is { $in: unknown[] } {
  return typeof value === "object" && value !== null && "$in" in value && Array.isArray((value as { $in?: unknown }).$in);
}

function isRegexFilter(value: unknown): value is { $regex: string } {
  return typeof value === "object" && value !== null && typeof (value as { $regex?: unknown }).$regex === "string";
}
