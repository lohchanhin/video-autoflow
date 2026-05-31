import { Router } from "express";
import { existsSync } from "node:fs";
import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import type { ProviderSecretStatusResponse } from "@ai-content-factory/shared-types";
import { ApiError } from "../errors.js";

const providerKeyNames = [
  "OPENAI_API_KEY",
  "DEEPSEEK_API_KEY",
  "GEMINI_API_KEY",
  "FAL_API_KEY",
  "REPLICATE_API_TOKEN",
  "RUNWAY_API_KEY",
  "MINIMAX_API_KEY",
  "SEEDANCE_API_KEY",
  "BYTEPLUS_ARK_API_KEY",
  "ELEVENLABS_API_KEY",
  "YOUTUBE_API_KEY",
  "YOUTUBE_REFRESH_TOKEN",
  "GOOGLE_APPLICATION_CREDENTIALS"
] as const;

export type ProviderSecretReader = (keyName: string) => string | undefined;
export type ProviderSecretWriter = (keyName: string, value: string) => Promise<void> | void;

export interface CreateProviderKeysRouterOptions {
  readSecret?: ProviderSecretReader | undefined;
  writeSecret?: ProviderSecretWriter | undefined;
}

export function createProviderKeysRouter(options: CreateProviderKeysRouterOptions = {}): Router {
  const router = Router();
  const readSecret = options.readSecret ?? ((keyName: string) => process.env[keyName]);
  const writeSecret = options.writeSecret ?? writeLocalEnvSecret;

  router.get("/provider-keys/status", (_req, res) => {
    const response: ProviderSecretStatusResponse = {
      keys: providerKeyNames.map((keyName) => {
        const value = readSecret(keyName)?.trim();

        return {
          configured: Boolean(value),
          keyName,
          lastFour: value ? value.slice(-4) : undefined
        };
      }),
      timestamp: new Date().toISOString()
    };

    res.json(response);
  });

  router.post("/provider-keys", async (req, res, next) => {
    try {
      const { keyName, value } = parseProviderKeyRequest(req.body);
      await writeSecret(keyName, value);
      process.env[keyName] = value;

      res.status(200).json({
        configured: true,
        keyName,
        lastFour: value.slice(-4)
      });
    } catch (error) {
      next(error);
    }
  });

  return router;
}

function parseProviderKeyRequest(body: unknown): { keyName: (typeof providerKeyNames)[number]; value: string } {
  if (typeof body !== "object" || body === null) {
    throw new ApiError("Request body must be an object.", 400, "BAD_REQUEST");
  }

  const record = body as Record<string, unknown>;
  const keyName = record.keyName;
  const value = record.value;

  if (!providerKeyNames.includes(keyName as (typeof providerKeyNames)[number])) {
    throw new ApiError("Unsupported provider key name.", 400, "BAD_REQUEST");
  }

  if (typeof value !== "string" || !value.trim()) {
    throw new ApiError("Provider key value is required.", 400, "BAD_REQUEST");
  }

  return {
    keyName: keyName as (typeof providerKeyNames)[number],
    value: value.trim()
  };
}

async function writeLocalEnvSecret(keyName: string, value: string): Promise<void> {
  const envPath = path.join(findWorkspaceRoot(), ".env");
  const existing = existsSync(envPath) ? await readFile(envPath, "utf8") : "";
  const line = `${keyName}=${escapeEnvValue(value)}`;
  const lines = existing.split(/\r?\n/u);
  const index = lines.findIndex((candidate) => candidate.startsWith(`${keyName}=`));

  if (index >= 0) {
    lines[index] = line;
  } else {
    if (lines.length > 0 && lines[lines.length - 1] !== "") {
      lines.push("");
    }
    lines.push(line);
  }

  await writeFile(envPath, `${lines.join("\n").replace(/\n+$/u, "")}\n`);
}

function escapeEnvValue(value: string): string {
  if (/[\s#"'\\]/u.test(value)) {
    return JSON.stringify(value);
  }

  return value;
}

function findWorkspaceRoot(startDirectory = process.cwd()): string {
  let currentDirectory = path.resolve(startDirectory);

  while (true) {
    if (existsSync(path.join(currentDirectory, "pnpm-workspace.yaml"))) {
      return currentDirectory;
    }

    const parentDirectory = path.dirname(currentDirectory);

    if (parentDirectory === currentDirectory) {
      return path.resolve(startDirectory);
    }

    currentDirectory = parentDirectory;
  }
}
