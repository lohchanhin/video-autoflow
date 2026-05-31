import { Router } from "express";
import type { HealthResponse } from "@ai-content-factory/shared-types";

export interface HealthRouterOptions {
  env: string;
}

export function createHealthRouter(options: HealthRouterOptions): Router {
  const router = Router();

  router.get("/health", (_req, res) => {
    const response: HealthResponse = {
      status: "ok",
      service: "api-server",
      env: options.env,
      version: process.env.npm_package_version ?? "0.1.0",
      timestamp: new Date().toISOString()
    };

    res.status(200).json(response);
  });

  return router;
}
