import { Router, type Request, type Response } from "express";
import type { CostLog, CostSummaryResponse, ListCostLogsResponse } from "@ai-content-factory/shared-types";
import type { ConnectCostDatabase, CostRecorderOptions } from "../modules/costs/cost-recorder.js";
import { withCostLogsRepository } from "../modules/costs/cost-recorder.js";

export interface CreateCostsRouterOptions {
  connectDatabase?: ConnectCostDatabase | undefined;
  costLogsRepository?: CostRecorderOptions["costLogsRepository"];
}

export function createCostsRouter(options: CreateCostsRouterOptions = {}): Router {
  const router = Router();

  router.get("/costs/logs", async (req: Request, res: Response, next) => {
    try {
      const logs = await withCostLogsRepository(options, (repository) => repository.list(parseListFilter(req.query)));
      const response: ListCostLogsResponse = {
        logs,
        timestamp: new Date().toISOString()
      };
      res.json(response);
    } catch (error) {
      next(error);
    }
  });

  router.get("/costs/summary", async (req: Request, res: Response, next) => {
    try {
      const jobId = firstQueryValue(req.query.jobId)?.trim();
      const summary = await withCostLogsRepository(options, (repository) => repository.summary({ ...(jobId ? { jobId } : {}) }));
      const response: CostSummaryResponse = {
        ...summary,
        ...(jobId ? { jobId } : {}),
        timestamp: new Date().toISOString()
      };
      res.json(response);
    } catch (error) {
      next(error);
    }
  });

  return router;
}

function parseListFilter(query: Request["query"]) {
  const jobId = firstQueryValue(query.jobId)?.trim();
  const provider = parseProvider(firstQueryValue(query.provider));
  const service = parseService(firstQueryValue(query.service));
  const limit = numberFromQuery(firstQueryValue(query.limit), 100);

  return {
    ...(jobId ? { jobId } : {}),
    ...(provider ? { provider } : {}),
    ...(service ? { service } : {}),
    limit
  };
}

function parseProvider(value: string | undefined): CostLog["provider"] | undefined {
  return value?.trim() || undefined;
}

function parseService(value: string | undefined): CostLog["service"] | undefined {
  return value === "script" || value === "image" || value === "reference_design" || value === "tts" || value === "bgm" || value === "video" || value === "compose" || value === "qc" || value === "other" ? value : undefined;
}

function firstQueryValue(value: unknown): string | undefined {
  if (Array.isArray(value)) {
    return typeof value[0] === "string" ? value[0] : undefined;
  }

  return typeof value === "string" ? value : undefined;
}

function numberFromQuery(value: string | undefined, fallback: number): number {
  const numberValue = Number(value);
  return Number.isFinite(numberValue) ? numberValue : fallback;
}
