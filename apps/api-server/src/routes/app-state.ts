import { Router, type Request, type Response } from "express";
import { config } from "@ai-content-factory/config";
import { connectMongoDatabase, createAppStateRepository, type AppStateRepository, type MongoDatabaseConnection } from "@ai-content-factory/database";
import type { AppStateSnapshotResponse } from "@ai-content-factory/shared-types";
import { ApiError } from "../errors.js";
import type { ConnectDatabase } from "./database.js";

const allowedKeyPrefix = "ai-content-factory:";

export interface CreateAppStateRouterOptions {
  appStateRepository?: AppStateRepository | undefined;
  connectDatabase?: ConnectDatabase | undefined;
}

export function createAppStateRouter(options: CreateAppStateRouterOptions = {}): Router {
  const router = Router();

  router.get("/app-state", async (req: Request, res: Response, next) => {
    try {
      const prefix = optionalString(firstQueryValue(req.query.prefix)) ?? allowedKeyPrefix;
      assertAllowedPrefix(prefix);

      const entries = await withAppStateRepository(options, (repository) => repository.list(prefix));
      const response: AppStateSnapshotResponse = {
        entries,
        source: "mongodb",
        timestamp: new Date().toISOString()
      };

      res.json(response);
    } catch (error) {
      next(error);
    }
  });

  router.put("/app-state/:key", async (req: Request, res: Response, next) => {
    try {
      const key = decodeURIComponent(paramString(req.params.key));
      const value = parseValue(req.body);
      assertAllowedKey(key);

      const entry = await withAppStateRepository(options, (repository) => repository.upsert(key, value));
      res.json({ entry });
    } catch (error) {
      next(error);
    }
  });

  router.post("/app-state/snapshot", async (req: Request, res: Response, next) => {
    try {
      const entries = parseSnapshotEntries(req.body);
      const saved = await withAppStateRepository(options, (repository) => repository.upsertMany(entries));

      res.json({
        entries: saved,
        source: "mongodb",
        timestamp: new Date().toISOString()
      } satisfies AppStateSnapshotResponse);
    } catch (error) {
      next(error);
    }
  });

  return router;
}

async function withAppStateRepository<T>(
  options: CreateAppStateRouterOptions,
  callback: (repository: AppStateRepository) => Promise<T>
): Promise<T> {
  if (options.appStateRepository) {
    return callback(options.appStateRepository);
  }

  let connection: MongoDatabaseConnection | null = null;

  try {
    connection = await (options.connectDatabase ?? defaultConnectDatabase)();
    const repository = createAppStateRepository(connection);
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

function parseSnapshotEntries(body: unknown): Array<{ key: string; value: string }> {
  if (!isRecord(body) || !Array.isArray(body.entries)) {
    throw new ApiError("entries array is required.", 400, "BAD_REQUEST");
  }

  return body.entries.map((entry) => {
    if (!isRecord(entry)) {
      throw new ApiError("Each app state entry must be an object.", 400, "BAD_REQUEST");
    }

    const key = stringFromUnknown(entry.key, "");
    const value = stringFromUnknown(entry.value, "");
    assertAllowedKey(key);

    return { key, value };
  });
}

function parseValue(body: unknown): string {
  if (!isRecord(body)) {
    throw new ApiError("Request body must be an object.", 400, "BAD_REQUEST");
  }

  return stringFromUnknown(body.value, "");
}

function assertAllowedPrefix(prefix: string): void {
  if (!allowedKeyPrefix.startsWith(prefix) && !prefix.startsWith(allowedKeyPrefix)) {
    throw new ApiError("Only AI Content Factory app state keys are allowed.", 400, "BAD_REQUEST");
  }
}

function assertAllowedKey(key: string): void {
  if (!key.startsWith(allowedKeyPrefix)) {
    throw new ApiError("Only AI Content Factory app state keys are allowed.", 400, "BAD_REQUEST");
  }
}

function firstQueryValue(value: string | string[] | unknown): string | undefined {
  return Array.isArray(value) ? optionalString(value[0]) : optionalString(value);
}

function optionalString(value: unknown): string | undefined {
  const normalized = stringFromUnknown(value, "");
  return normalized || undefined;
}

function paramString(value: string | string[] | undefined): string {
  const normalized = Array.isArray(value) ? value[0] : value;

  if (!normalized) {
    throw new ApiError("Route parameter is required.", 400, "BAD_REQUEST");
  }

  return normalized;
}

function stringFromUnknown(value: unknown, fallback: string): string {
  return typeof value === "string" ? value.trim() : fallback;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}
