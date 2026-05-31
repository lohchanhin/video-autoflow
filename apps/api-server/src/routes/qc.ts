import { Router, type Request, type Response } from "express";
import type { GenerateQcReportRequest } from "@ai-content-factory/shared-types";
import type { StorageAdapter } from "@ai-content-factory/storage";
import { createQcReportService, type QcReportService } from "../modules/generation/qc-service.js";

export interface CreateQcRouterOptions {
  qcReportService?: QcReportService | undefined;
  storage: StorageAdapter;
}

export function createQcRouter(options: CreateQcRouterOptions): Router {
  const router = Router();
  const service = options.qcReportService ?? createQcReportService({ storage: options.storage });

  router.post("/generation/qc", async (req: Request, res: Response, next) => {
    try {
      const response = await service.generateReport(parseRequest(req.body));
      res.status(201).json(response);
    } catch (error) {
      next(error);
    }
  });

  return router;
}

function parseRequest(body: unknown): GenerateQcReportRequest {
  if (!isRecord(body)) {
    throw new Error("Request body must be an object.");
  }

  const artifacts = isRecord(body.artifacts) ? body.artifacts : {};

  return {
    actualCostRM: numberFromBody(body.actualCostRM, 0),
    artifacts: {
      bgm: optionalStringFromBody(artifacts.bgm),
      finalVideo: optionalStringFromBody(artifacts.finalVideo),
      sceneImages: stringArrayFromBody(artifacts.sceneImages),
      subtitles: optionalStringFromBody(artifacts.subtitles),
      voiceover: optionalStringFromBody(artifacts.voiceover)
    },
    costLimitRM: numberFromBody(body.costLimitRM, 7.5),
    jobId: stringFromBody(body.jobId, "jobId"),
    sceneCount: numberFromBody(body.sceneCount, 5)
  };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function stringFromBody(value: unknown, name: string): string {
  if (typeof value !== "string" || !value.trim()) {
    throw new Error(`${name} is required.`);
  }

  return value;
}

function optionalStringFromBody(value: unknown): string | undefined {
  return typeof value === "string" && value.trim() ? value : undefined;
}

function stringArrayFromBody(value: unknown): string[] {
  if (!Array.isArray(value)) {
    return [];
  }

  return value.filter((item): item is string => typeof item === "string" && item.trim().length > 0).map((item) => item.trim());
}

function numberFromBody(value: unknown, fallback: number): number {
  const numberValue = typeof value === "number" ? value : Number(value);
  return Number.isFinite(numberValue) ? numberValue : fallback;
}
