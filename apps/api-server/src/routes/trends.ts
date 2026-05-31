import { Router, type Request, type Response } from "express";
import { config } from "@ai-content-factory/config";
import type { TrendScanRequest } from "@ai-content-factory/shared-types";
import { createTrendScanService, type TrendScanService } from "../modules/trends/trend-service.js";

export interface CreateTrendsRouterOptions {
  trendScanService?: TrendScanService | undefined;
}

export function createTrendsRouter(options: CreateTrendsRouterOptions = {}): Router {
  const router = Router();
  const service =
    options.trendScanService ??
    createTrendScanService({
      getApiKey: () => process.env.YOUTUBE_API_KEY ?? config.providers.youtube.apiKey
    });

  router.post("/trends/scan", async (req: Request, res: Response, next) => {
    try {
      const response = await service.scanTrends(parseTrendScanRequest(req.body));
      res.status(200).json(response);
    } catch (error) {
      next(error);
    }
  });

  return router;
}

function parseTrendScanRequest(body: unknown): TrendScanRequest {
  if (!isRecord(body)) {
    throw new Error("Request body must be an object.");
  }

  const maxResults = optionalNumberFromBody(body.maxResults);
  const categoryId = optionalStringFromBody(body.categoryId);
  const excludeKeywords = optionalStringFromBody(body.excludeKeywords);
  const includeKeywords = optionalStringFromBody(body.includeKeywords);
  const minVelocityScore = optionalNumberFromBody(body.minVelocityScore);
  const minViews = optionalNumberFromBody(body.minViews);
  return {
    language: body.language === "en-US" ? "en-US" : "zh-CN",
    languageMode: body.languageMode === "strict" ? "strict" : "loose",
    publishedWithinDays: numberFromBody(body.publishedWithinDays, 7),
    query: stringFromBody(body.query, "query"),
    regionCode: typeof body.regionCode === "string" && body.regionCode.trim() ? body.regionCode : "MY",
    safeMode: body.safeMode === "standard" ? "standard" : "strict",
    ...(categoryId === undefined ? {} : { categoryId }),
    ...(excludeKeywords === undefined ? {} : { excludeKeywords }),
    ...(includeKeywords === undefined ? {} : { includeKeywords }),
    ...(maxResults === undefined ? {} : { maxResults }),
    ...(minVelocityScore === undefined ? {} : { minVelocityScore }),
    ...(minViews === undefined ? {} : { minViews })
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
  return typeof value === "string" && value.trim() ? value.trim() : undefined;
}

function numberFromBody(value: unknown, fallback: number): number {
  const numberValue = typeof value === "number" ? value : Number(value);
  return Number.isFinite(numberValue) ? numberValue : fallback;
}

function optionalNumberFromBody(value: unknown): number | undefined {
  if (value === undefined || value === null || value === "") {
    return undefined;
  }

  const numberValue = typeof value === "number" ? value : Number(value);
  return Number.isFinite(numberValue) ? numberValue : undefined;
}
