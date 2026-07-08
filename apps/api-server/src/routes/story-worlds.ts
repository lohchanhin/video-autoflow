import { Router, type Request, type Response } from "express";
import { config } from "@ai-content-factory/config";
import {
  connectMongoDatabase,
  createStoryWorldsRepository,
  type MongoDatabaseConnection,
  type StoryWorldCreateInput,
  type StoryWorldPatchInput,
  type StoryWorldsRepository
} from "@ai-content-factory/database";
import type { StoryWorld } from "@ai-content-factory/shared-types";
import { ApiError } from "../errors.js";
import type { ConnectDatabase } from "./database.js";

export interface CreateStoryWorldsRouterOptions {
  connectDatabase?: ConnectDatabase | undefined;
  storyWorldsRepository?: StoryWorldsRepository | undefined;
}

export function createStoryWorldsRouter(options: CreateStoryWorldsRouterOptions): Router {
  const router = Router();

  router.get("/story-worlds", async (_req: Request, res: Response, next) => {
    try {
      const storyWorlds = await withStoryWorldsRepository(options, (repository) => repository.list());
      res.json({
        storyWorlds,
        timestamp: new Date().toISOString()
      });
    } catch (error) {
      next(error);
    }
  });

  router.post("/story-worlds", async (req: Request, res: Response, next) => {
    try {
      const storyWorld = await withStoryWorldsRepository(options, (repository) => repository.create(parseStoryWorldCreate(req.body)));
      res.status(201).json({ storyWorld });
    } catch (error) {
      next(error);
    }
  });

  router.patch("/story-worlds/:id", async (req: Request, res: Response, next) => {
    try {
      const id = paramString(req.params.id);
      const storyWorld = await withStoryWorldsRepository(options, (repository) => repository.patch(id, parseStoryWorldPatch(req.body)));

      if (!storyWorld) {
        throw new ApiError("Story world not found.", 404, "STORY_WORLD_NOT_FOUND");
      }

      res.json({ storyWorld });
    } catch (error) {
      next(error);
    }
  });

  router.delete("/story-worlds/:id", async (req: Request, res: Response, next) => {
    try {
      const id = paramString(req.params.id);
      const deleted = await withStoryWorldsRepository(options, (repository) => repository.delete(id));

      if (!deleted) {
        throw new ApiError("Story world not found.", 404, "STORY_WORLD_NOT_FOUND");
      }

      res.status(204).end();
    } catch (error) {
      next(error);
    }
  });

  return router;
}

async function withStoryWorldsRepository<T>(
  options: CreateStoryWorldsRouterOptions,
  callback: (repository: StoryWorldsRepository) => Promise<T>
): Promise<T> {
  if (options.storyWorldsRepository) {
    return callback(options.storyWorldsRepository);
  }

  let connection: MongoDatabaseConnection | null = null;

  try {
    connection = await (options.connectDatabase ?? defaultConnectDatabase)();
    const repository = createStoryWorldsRepository(connection);
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

function parseStoryWorldCreate(body: unknown): StoryWorldCreateInput {
  if (!isRecord(body)) {
    throw new ApiError("Request body must be an object.", 400, "BAD_REQUEST");
  }

  const name = stringFromUnknown(body.name, "");

  if (!name) {
    throw new ApiError("name is required.", 400, "BAD_REQUEST");
  }

  return {
    defaultSceneAssetIds: stringArrayFromUnknown(body.defaultSceneAssetIds),
    description: optionalString(body.description),
    id: optionalString(body.id),
    name,
    recurringCharacterAssetIds: stringArrayFromUnknown(body.recurringCharacterAssetIds),
    relationshipMap: optionalString(body.relationshipMap),
    safetyRules: optionalString(body.safetyRules),
    seriesIds: stringArrayFromUnknown(body.seriesIds),
    status: parseStoryWorldStatus(body.status),
    visualStyle: optionalString(body.visualStyle)
  };
}

function parseStoryWorldPatch(body: unknown): StoryWorldPatchInput {
  if (!isRecord(body)) {
    throw new ApiError("Request body must be an object.", 400, "BAD_REQUEST");
  }

  const patch: StoryWorldPatchInput = {};
  const status = parseStoryWorldStatus(body.status);

  if (body.defaultSceneAssetIds !== undefined) patch.defaultSceneAssetIds = stringArrayFromUnknown(body.defaultSceneAssetIds);
  if (body.description !== undefined) patch.description = stringFromUnknown(body.description, "");
  if (body.name !== undefined) patch.name = stringFromUnknown(body.name, "");
  if (body.recurringCharacterAssetIds !== undefined) patch.recurringCharacterAssetIds = stringArrayFromUnknown(body.recurringCharacterAssetIds);
  if (body.relationshipMap !== undefined) patch.relationshipMap = stringFromUnknown(body.relationshipMap, "");
  if (body.safetyRules !== undefined) patch.safetyRules = stringFromUnknown(body.safetyRules, "");
  if (body.seriesIds !== undefined) patch.seriesIds = stringArrayFromUnknown(body.seriesIds);
  if (status) patch.status = status;
  if (body.visualStyle !== undefined) patch.visualStyle = stringFromUnknown(body.visualStyle, "");

  return patch;
}

function parseStoryWorldStatus(value: unknown): StoryWorld["status"] | undefined {
  return value === "active" || value === "archived" || value === "draft" ? value : undefined;
}

function paramString(value: string | string[] | undefined): string {
  const id = Array.isArray(value) ? value[0] : value;

  if (!id) {
    throw new ApiError("id is required.", 400, "BAD_REQUEST");
  }

  return id;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value && typeof value === "object" && !Array.isArray(value));
}

function optionalString(value: unknown): string | undefined {
  return typeof value === "string" ? value.trim() : undefined;
}

function stringFromUnknown(value: unknown, fallback: string): string {
  return typeof value === "string" ? value.trim() : fallback;
}

function stringArrayFromUnknown(value: unknown): string[] {
  return Array.isArray(value)
    ? value.filter((item): item is string => typeof item === "string" && item.trim().length > 0).map((item) => item.trim())
    : [];
}
