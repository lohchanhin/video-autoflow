import { Router, type Request, type Response } from "express";
import { config } from "@ai-content-factory/config";
import { connectMongoDatabase, type MongoDatabaseConnection } from "@ai-content-factory/database";
import type { DatabaseStatusResponse } from "@ai-content-factory/shared-types";

export type ConnectDatabase = () => Promise<MongoDatabaseConnection>;

export interface CreateDatabaseRouterOptions {
  connectDatabase?: ConnectDatabase | undefined;
}

export function createDatabaseRouter(options: CreateDatabaseRouterOptions = {}): Router {
  const router = Router();
  const connectDatabase = options.connectDatabase ?? defaultConnectDatabase;

  router.get("/database/status", async (_req: Request, res: Response, next) => {
    let connection: MongoDatabaseConnection | null = null;

    try {
      connection = await connectDatabase();
      const ping = await connection.ping();
      const response: DatabaseStatusResponse = {
        databaseName: ping.databaseName,
        ok: ping.ok,
        service: "mongodb",
        timestamp: new Date().toISOString()
      };

      res.json(response);
    } catch (error) {
      next(error);
    } finally {
      await connection?.close();
    }
  });

  return router;
}

async function defaultConnectDatabase(): Promise<MongoDatabaseConnection> {
  return connectMongoDatabase({
    dbName: config.mongoDbName,
    mongoUri: config.mongoUri,
    serverSelectionTimeoutMS: 3000
  });
}
