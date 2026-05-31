import { config } from "@ai-content-factory/config";
import {
  connectMongoDatabase,
  createCostLogsRepository,
  type CostLogCreateInput,
  type CostLogsRepository,
  type MongoDatabaseConnection
} from "@ai-content-factory/database";
import { createLogger } from "@ai-content-factory/logger";
import type { CostLog, CostLogUsage } from "@ai-content-factory/shared-types";

const logger = createLogger({ service: "cost-recorder" });

export type ConnectCostDatabase = () => Promise<MongoDatabaseConnection>;

export interface CostRecorderOptions {
  connectDatabase?: ConnectCostDatabase | undefined;
  costLogsRepository?: CostLogsRepository | undefined;
}

export interface CostRecorder {
  record(input: CostLogCreateInput): Promise<CostLog | null>;
}

export function createCostRecorder(options: CostRecorderOptions = {}): CostRecorder {
  return {
    async record(input: CostLogCreateInput): Promise<CostLog | null> {
      try {
        return await withCostLogsRepository(options, (repository) => repository.create(input));
      } catch (error) {
        logger.error("Failed to record provider cost log.", {
          error,
          jobId: input.jobId,
          operation: input.operation,
          provider: input.provider,
          service: input.service
        });
        return null;
      }
    }
  };
}

export async function withCostLogsRepository<T>(
  options: CostRecorderOptions,
  callback: (repository: CostLogsRepository) => Promise<T>
): Promise<T> {
  if (options.costLogsRepository) {
    return callback(options.costLogsRepository);
  }

  let connection: MongoDatabaseConnection | null = null;

  try {
    connection = await (options.connectDatabase ?? defaultConnectDatabase)();
    const repository = createCostLogsRepository(connection);
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

export function numericUsageValue(usage: CostLogUsage | undefined, key: string): number {
  const value = usage?.[key];
  return typeof value === "number" && Number.isFinite(value) ? value : 0;
}
