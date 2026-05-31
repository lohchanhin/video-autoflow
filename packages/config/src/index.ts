import dotenv from "dotenv";
import { existsSync } from "node:fs";
import path from "node:path";
import type { BudgetConfig, UploadPrivacyStatus } from "@ai-content-factory/shared-types";

dotenv.config({ path: findEnvPath() });

function findEnvPath(startDirectory = process.cwd()): string {
  let currentDirectory = path.resolve(startDirectory);

  while (true) {
    const candidate = path.join(currentDirectory, ".env");

    if (existsSync(candidate)) {
      return candidate;
    }

    const parentDirectory = path.dirname(currentDirectory);

    if (parentDirectory === currentDirectory) {
      return ".env";
    }

    currentDirectory = parentDirectory;
  }
}

export function required(name: string): string {
  const value = process.env[name];

  if (!value) {
    throw new Error(`Missing required environment variable: ${name}`);
  }

  return value;
}

export function stringEnv(name: string, defaultValue: string): string {
  return process.env[name] ?? defaultValue;
}

export function numberEnv(name: string, defaultValue: number): number {
  const raw = process.env[name];

  if (raw === undefined || raw === "") {
    return defaultValue;
  }

  const parsed = Number(raw);

  if (!Number.isFinite(parsed)) {
    throw new Error(`Environment variable ${name} must be a number.`);
  }

  return parsed;
}

export function booleanEnv(name: string, defaultValue: boolean): boolean {
  const raw = process.env[name];

  if (raw === undefined || raw === "") {
    return defaultValue;
  }

  return raw.toLowerCase() === "true";
}

function privacyEnv(name: string, defaultValue: UploadPrivacyStatus): UploadPrivacyStatus {
  const value = stringEnv(name, defaultValue);

  if (value !== "private" && value !== "unlisted" && value !== "public") {
    throw new Error(`Environment variable ${name} must be private, unlisted, or public.`);
  }

  return value;
}

const defaultPrivacy = privacyEnv("UPLOAD_DEFAULT_PRIVACY", "private");
const enableAutoPublic = booleanEnv("ENABLE_AUTO_PUBLIC", false);

if (defaultPrivacy === "public" && !enableAutoPublic) {
  throw new Error("UPLOAD_DEFAULT_PRIVACY cannot be public unless ENABLE_AUTO_PUBLIC=true.");
}

const budget: BudgetConfig = {
  dailyRM: numberEnv("DAILY_BUDGET_RM", 80),
  monthlyRM: numberEnv("MONTHLY_BUDGET_RM", 2500),
  maxPerVideoRM: numberEnv("MAX_COST_PER_VIDEO_RM", 7.5),
  maxVideosPerDay: numberEnv("MAX_VIDEOS_PER_DAY", 10)
};

const seedanceBaseUrl = stringEnv("SEEDANCE_BASE_URL", "https://ark.ap-southeast.bytepluses.com/api/v3");
const seedanceApiStyle = stringEnv("SEEDANCE_API_STYLE", seedanceBaseUrl.includes("evolink") ? "evolink" : "byteplus-ark");
const defaultSeedanceModel = seedanceApiStyle === "evolink" ? "seedance-2.0-text-to-video" : "dreamina-seedance-2-0-260128";

export const config = {
  env: stringEnv("NODE_ENV", "development"),
  port: numberEnv("PORT", 4000),
  apiPublicBaseUrl: stringEnv("API_PUBLIC_BASE_URL", "http://localhost:4000"),
  adminWebUrl: stringEnv("ADMIN_WEB_URL", "http://127.0.0.1:5173"),
  mongoUri: stringEnv("MONGO_URI", "mongodb://localhost:27017/ai_content_factory"),
  mongoDbName: stringEnv("MONGO_DB_NAME", "ai_content_factory"),
  redisUrl: stringEnv("REDIS_URL", "redis://localhost:6379"),
  storage: {
    driver: stringEnv("STORAGE_DRIVER", "auto"),
    local: {
      uploadsDir: stringEnv("UPLOADS_DIR", "uploads")
    },
    minio: {
      endpoint: stringEnv("MINIO_ENDPOINT", "http://localhost:9000"),
      accessKey: process.env.MINIO_ACCESS_KEY,
      secretKey: process.env.MINIO_SECRET_KEY,
      bucket: stringEnv("MINIO_BUCKET", "content-factory")
    },
    gcp: {
      projectId: process.env.GCP_PROJECT_ID,
      bucket: process.env.GCS_BUCKET,
      prefix: stringEnv("GCS_PREFIX", "shorts"),
      applicationCredentials: process.env.GOOGLE_APPLICATION_CREDENTIALS
    }
  },
  budget,
  currency: {
    defaultCurrency: stringEnv("DEFAULT_CURRENCY", "MYR"),
    usdToMyrRate: numberEnv("USD_TO_MYR_RATE", 3.95)
  },
  publishing: {
    defaultPrivacy,
    enableAutoPublic
  },
  providers: {
    openai: {
      apiKey: process.env.OPENAI_API_KEY,
      baseUrl: stringEnv("OPENAI_BASE_URL", "https://api.openai.com/v1"),
      textModel: stringEnv("OPENAI_TEXT_MODEL", "gpt-4.1-mini"),
      imageModel: stringEnv("OPENAI_IMAGE_MODEL", "gpt-image-2"),
      imageSize: stringEnv("OPENAI_IMAGE_SIZE", "1024x1536"),
      imageQuality: stringEnv("OPENAI_IMAGE_QUALITY", "high"),
      ttsModel: stringEnv("OPENAI_TTS_MODEL", "gpt-4o-mini-tts"),
      ttsVoice: stringEnv("OPENAI_TTS_VOICE", "cedar"),
      ttsFormat: stringEnv("OPENAI_TTS_FORMAT", "mp3"),
      ttsCostUsdPer1KChars: numberEnv("OPENAI_TTS_COST_USD_PER_1K_CHARS", 0.015)
    },
    deepseek: {
      apiKey: process.env.DEEPSEEK_API_KEY,
      baseUrl: stringEnv("DEEPSEEK_BASE_URL", "https://api.deepseek.com")
    },
    gemini: {
      apiKey: process.env.GEMINI_API_KEY,
      baseUrl: stringEnv("GEMINI_BASE_URL", "https://generativelanguage.googleapis.com")
    },
    fal: {
      apiKey: process.env.FAL_API_KEY,
      baseUrl: stringEnv("FAL_BASE_URL", "https://fal.run")
    },
    replicate: {
      apiToken: process.env.REPLICATE_API_TOKEN,
      baseUrl: stringEnv("REPLICATE_BASE_URL", "https://api.replicate.com/v1")
    },
    runway: {
      apiKey: process.env.RUNWAY_API_KEY,
      baseUrl: stringEnv("RUNWAY_BASE_URL", "https://api.dev.runwayml.com/v1")
    },
    minimax: {
      apiKey: process.env.MINIMAX_API_KEY,
      baseUrl: stringEnv("MINIMAX_BASE_URL", "https://api.minimax.io/v1")
    },
    seedance: {
      apiKey: process.env.SEEDANCE_API_KEY ?? process.env.BYTEPLUS_ARK_API_KEY ?? process.env.ARK_API_KEY ?? process.env.EVOLINK_API_KEY,
      apiStyle: seedanceApiStyle,
      baseUrl: seedanceBaseUrl,
      imageToVideoModel: stringEnv("SEEDANCE_IMAGE_TO_VIDEO_MODEL", stringEnv("SEEDANCE_MODEL", defaultSeedanceModel)),
      textToVideoModel: stringEnv("SEEDANCE_TEXT_TO_VIDEO_MODEL", stringEnv("SEEDANCE_MODEL", defaultSeedanceModel)),
      quality: stringEnv("SEEDANCE_QUALITY", "720p"),
      aspectRatio: stringEnv("SEEDANCE_ASPECT_RATIO", "9:16"),
      pollIntervalMs: numberEnv("SEEDANCE_POLL_INTERVAL_MS", 5000),
      timeoutMs: numberEnv("SEEDANCE_TIMEOUT_MS", 240000),
      costRMPerSecond: numberEnv("SEEDANCE_COST_RM_PER_SECOND", 0),
      costRMPerMillionTokens: numberEnv("SEEDANCE_COST_RM_PER_M_TOKENS", 0)
    },
    elevenlabs: {
      apiKey: process.env.ELEVENLABS_API_KEY,
      baseUrl: stringEnv("ELEVENLABS_BASE_URL", "https://api.elevenlabs.io/v1"),
      musicCostRMPerMinute: numberEnv("ELEVENLABS_MUSIC_COST_RM_PER_MINUTE", 0),
      musicModel: stringEnv("ELEVENLABS_MUSIC_MODEL", "music_v1"),
      musicOutputFormat: stringEnv("ELEVENLABS_MUSIC_OUTPUT_FORMAT", "mp3_44100_128")
    },
    youtube: {
      apiKey: process.env.YOUTUBE_API_KEY,
      clientId: process.env.YOUTUBE_CLIENT_ID,
      clientSecret: process.env.YOUTUBE_CLIENT_SECRET,
      redirectUri: process.env.YOUTUBE_REDIRECT_URI,
      refreshToken: process.env.YOUTUBE_REFRESH_TOKEN,
      uploadBaseUrl: stringEnv("YOUTUBE_UPLOAD_BASE_URL", "https://www.googleapis.com/upload/youtube/v3")
    }
  },
  localPorts: {
    scriptWorker: numberEnv("SCRIPT_WORKER_PORT", 4101),
    storyboardWorker: numberEnv("STORYBOARD_WORKER_PORT", 4102),
    imageWorker: numberEnv("IMAGE_WORKER_PORT", 4103),
    videoWorker: numberEnv("VIDEO_WORKER_PORT", 4104),
    ttsWorker: numberEnv("TTS_WORKER_PORT", 4105),
    subtitleWorker: numberEnv("SUBTITLE_WORKER_PORT", 4106),
    composeWorker: numberEnv("COMPOSE_WORKER_PORT", 4107),
    publisherWorker: numberEnv("PUBLISHER_WORKER_PORT", 4108),
    storageAdapter: numberEnv("STORAGE_ADAPTER_PORT", 4109)
  }
} as const;

export type AppConfig = typeof config;
