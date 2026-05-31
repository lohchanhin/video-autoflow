import { setTimeout as delay } from "node:timers/promises";
import { config } from "@ai-content-factory/config";
import type { GenerateVideoClipRequest, GenerateVideoClipResponse, GeneratedStorageObject } from "@ai-content-factory/shared-types";
import type { StorageAdapter, StoredObject } from "@ai-content-factory/storage";
import { MissingGenerationDependencyError } from "../../errors.js";

type FetchLike = typeof fetch;

export interface VideoClipGenerationServiceOptions {
  fetchFn?: FetchLike | undefined;
  storage: StorageAdapter;
}

export interface VideoClipGenerationService {
  generateVideoClip(input: GenerateVideoClipRequest): Promise<GenerateVideoClipResponse>;
}

interface SeedanceTask {
  error?: string | undefined;
  id?: string | undefined;
  progress?: number | undefined;
  results?: string[] | undefined;
  status?: string | undefined;
  task_id?: string | undefined;
  usage?: {
    completionTokens?: number | undefined;
    totalTokens?: number | undefined;
  } | undefined;
  videoUrl?: string | undefined;
}

interface RuntimeSeedanceConfig {
  apiKey?: string | undefined;
  apiStyle: string;
  aspectRatio: string;
  baseUrl: string;
  costRMPerMillionTokens: number;
  costRMPerSecond: number;
  imageToVideoModel: string;
  pollIntervalMs: number;
  quality: string;
  textToVideoModel: string;
  timeoutMs: number;
}

export function createVideoClipGenerationService(options: VideoClipGenerationServiceOptions): VideoClipGenerationService {
  const fetchFn = options.fetchFn ?? fetch;

  return {
    async generateVideoClip(input: GenerateVideoClipRequest): Promise<GenerateVideoClipResponse> {
      const seedanceConfig = getRuntimeSeedanceConfig(input);
      const apiKey = seedanceConfig.apiKey?.trim();

      if (!apiKey) {
        throw new MissingGenerationDependencyError("Missing BYTEPLUS_ARK_API_KEY or SEEDANCE_API_KEY. Configure Seedance 2.0 in Keys or .env before generating video clips. No mock video clip will be generated.");
      }

      const jobId = input.jobId?.trim() || `job_${crypto.randomUUID().slice(0, 8)}`;
      const sceneId = clampInteger(input.sceneId ?? 1, 1, 99);
      const durationSeconds = clampInteger(input.durationSeconds ?? 5, 4, 15);
      const isEvolinkApi = seedanceConfig.apiStyle === "evolink";
      const baseUrl = isEvolinkApi ? normalizeEvolinkBaseUrl(seedanceConfig.baseUrl) : normalizeBytePlusArkBaseUrl(seedanceConfig.baseUrl);
      const prompt = buildSeedancePrompt(input.prompt, input.topic);
      const sourceImageUrl = normalizeExternalImageUrl(input.imageUrl);
      const lastFrameImageUrl = normalizeExternalImageUrl(input.lastFrameImageUrl);
      const referenceImageUrls = normalizeExternalImageUrls(input.referenceImageUrls).filter((url) => url !== sourceImageUrl && url !== lastFrameImageUrl);
      const mode: GenerateVideoClipResponse["clip"]["mode"] = sourceImageUrl ? "image-to-video" : referenceImageUrls.length > 0 ? "reference-to-video" : "text-to-video";
      const model = input.model?.trim() || (mode === "image-to-video" ? seedanceConfig.imageToVideoModel : seedanceConfig.textToVideoModel);
      const fallbackReason = sourceImageUrl
        ? undefined
        : input.imageUrl || input.lastFrameImageUrl || (input.referenceImageUrls?.length ?? 0) > 0
          ? "Some Seedance reference assets were not publicly reachable URLs. Localhost/local upload paths were ignored; use a public uploads URL, GCS signed URL, or HTTPS storage URL for full reference-guided video."
          : "No source image URL was provided, so this run used text-to-video for connection testing.";

      const task = isEvolinkApi
        ? await submitEvolinkSeedanceTask(fetchFn, {
            apiKey,
            baseUrl,
            body: {
              aspect_ratio: input.aspectRatio ?? seedanceConfig.aspectRatio,
              duration: durationSeconds,
              generate_audio: false,
              model,
              prompt,
              quality: input.quality ?? seedanceConfig.quality,
              ...([sourceImageUrl, lastFrameImageUrl, ...referenceImageUrls].filter(Boolean).length > 0 ? { image_urls: [sourceImageUrl, lastFrameImageUrl, ...referenceImageUrls].filter(Boolean) } : {})
            }
          })
        : await submitBytePlusArkTask(fetchFn, {
            apiKey,
            baseUrl,
            body: buildBytePlusArkTaskBody({
              aspectRatio: input.aspectRatio ?? seedanceConfig.aspectRatio,
              durationSeconds,
              model,
              prompt,
              quality: input.quality ?? seedanceConfig.quality,
              lastFrameImageUrl,
              referenceImageUrls,
              sourceImageUrl
            })
          });
      const taskId = getTaskId(task);
      const completedTask = isEvolinkApi
        ? await pollEvolinkSeedanceTask(fetchFn, { apiKey, baseUrl, taskId })
        : await pollBytePlusArkTask(fetchFn, { apiKey, baseUrl, taskId });
      const remoteVideoUrl = getCompletedVideoUrl(completedTask);
      const videoBuffer = await downloadVideo(fetchFn, remoteVideoUrl);
      const clipObject = await options.storage.writeFile(`jobs/${jobId}/clips/scene_${String(sceneId).padStart(2, "0")}_seedance.mp4`, videoBuffer);
      const effectiveCostRMPerMillionTokens = getSeedanceCostRMPerMillionTokens(seedanceConfig, model);
      const costRM = calculateSeedanceCostRM(durationSeconds, completedTask, seedanceConfig, effectiveCostRMPerMillionTokens);
      const usage = {
        completionTokens: completedTask.usage?.completionTokens ?? null,
        costRMPerMillionTokens: effectiveCostRMPerMillionTokens,
        durationSeconds,
        hasImageInput: Boolean(sourceImageUrl || lastFrameImageUrl || referenceImageUrls.length > 0),
        pricingMode: completedTask.usage?.totalTokens ? "token_usage" : "duration_fallback",
        totalTokens: completedTask.usage?.totalTokens ?? null
      };

      return {
        clip: {
          asset: toGeneratedObject(clipObject),
          costRM,
          durationSeconds,
          mode,
          prompt,
          referenceImageUrls,
          sceneId,
          lastFrameImageUrl,
          sourceImageUrl,
          taskId
        },
        costRM,
        fallbackReason,
        jobId,
        model,
        provider: input.provider?.trim() || "seedance",
        status: "VIDEO_DONE",
        usage
      };
    }
  };
}

async function submitEvolinkSeedanceTask(fetchFn: FetchLike, input: { apiKey: string; baseUrl: string; body: Record<string, unknown> }): Promise<SeedanceTask> {
  const response = await fetchFn(`${input.baseUrl}/videos/generations`, {
    body: JSON.stringify(input.body),
    headers: {
      Authorization: `Bearer ${input.apiKey}`,
      "Content-Type": "application/json"
    },
    method: "POST"
  });

  return parseSeedanceResponse(response, "Seedance 2.0 video task submission failed");
}

async function submitBytePlusArkTask(fetchFn: FetchLike, input: { apiKey: string; baseUrl: string; body: Record<string, unknown> }): Promise<SeedanceTask> {
  const response = await fetchFn(`${input.baseUrl}/contents/generations/tasks`, {
    body: JSON.stringify(input.body),
    headers: {
      Authorization: `Bearer ${input.apiKey}`,
      "Content-Type": "application/json"
    },
    method: "POST"
  });

  return parseSeedanceResponse(response, "BytePlus ModelArk Seedance video task submission failed");
}

async function pollEvolinkSeedanceTask(fetchFn: FetchLike, input: { apiKey: string; baseUrl: string; taskId: string }): Promise<SeedanceTask> {
  const startedAt = Date.now();
  const seedanceConfig = getRuntimeSeedanceConfig();

  while (Date.now() - startedAt <= seedanceConfig.timeoutMs) {
    const response = await fetchFn(`${input.baseUrl}/tasks/${encodeURIComponent(input.taskId)}`, {
      headers: {
        Authorization: `Bearer ${input.apiKey}`
      },
      method: "GET"
    });
    const task = await parseSeedanceResponse(response, "Seedance 2.0 task polling failed");
    const status = task.status?.toLowerCase();

    if (status === "completed") {
      return task;
    }

    if (status === "failed" || status === "cancelled") {
      throw new Error(`Seedance 2.0 video generation failed with status: ${task.status}${task.error ? `: ${task.error}` : ""}.`);
    }

    await delay(Math.max(100, seedanceConfig.pollIntervalMs));
  }

  throw new Error(`Seedance 2.0 video generation timed out after ${seedanceConfig.timeoutMs}ms.`);
}

async function pollBytePlusArkTask(fetchFn: FetchLike, input: { apiKey: string; baseUrl: string; taskId: string }): Promise<SeedanceTask> {
  const startedAt = Date.now();
  const seedanceConfig = getRuntimeSeedanceConfig();

  while (Date.now() - startedAt <= seedanceConfig.timeoutMs) {
    const response = await fetchFn(`${input.baseUrl}/contents/generations/tasks/${encodeURIComponent(input.taskId)}`, {
      headers: {
        Authorization: `Bearer ${input.apiKey}`
      },
      method: "GET"
    });
    const task = await parseSeedanceResponse(response, "BytePlus ModelArk Seedance task polling failed");
    const status = task.status?.toLowerCase();

    if (status === "succeeded" || status === "completed") {
      return task;
    }

    if (status === "failed" || status === "cancelled" || status === "expired") {
      throw new Error(`Seedance 2.0 video generation failed with status: ${task.status}${task.error ? `: ${task.error}` : ""}.`);
    }

    await delay(Math.max(100, seedanceConfig.pollIntervalMs));
  }

  throw new Error(`Seedance 2.0 video generation timed out after ${seedanceConfig.timeoutMs}ms.`);
}

async function parseSeedanceResponse(response: Response, context: string): Promise<SeedanceTask> {
  const text = await response.text();
  const parsed = parseJsonResponse(text);

  if (!response.ok) {
    throw new Error(`${context}: ${extractSeedanceError(parsed) || response.statusText || `HTTP ${response.status}`} (HTTP ${response.status})`);
  }

  return unwrapSeedanceTask(parsed);
}

function unwrapSeedanceTask(value: unknown): SeedanceTask {
  if (!isRecord(value)) {
    return {};
  }

  const source = isRecord(value.data) ? value.data : value;
  const videoUrl = extractVideoUrl(source);

  return {
    error: extractSeedanceError(source),
    id: stringValue(source.id) ?? stringValue(source.video_id) ?? stringValue(source.task_id),
    progress: numberValue(source.progress),
    results: arrayStringValue(source.results) ?? (videoUrl ? [videoUrl] : undefined),
    status: stringValue(source.status),
    task_id: stringValue(source.task_id),
    usage: usageValue(source.usage),
    videoUrl
  };
}

function extractSeedanceError(value: unknown): string {
  if (!isRecord(value)) {
    return "";
  }

  if (isRecord(value.error)) {
    return [stringValue(value.error.message), stringValue(value.error.code), stringValue(value.error.type)].filter(Boolean).join(" / ");
  }

  return [stringValue(value.message), stringValue(value.code)].filter(Boolean).join(" / ");
}

function getTaskId(task: SeedanceTask): string {
  const taskId = task.id ?? task.task_id;

  if (!taskId) {
    throw new Error("Seedance 2.0 task submission did not return a task id.");
  }

  return taskId;
}

function getCompletedVideoUrl(task: SeedanceTask): string {
  const videoUrl = task.videoUrl ?? task.results?.[0];

  if (!videoUrl) {
    throw new Error("Seedance 2.0 completed task did not return a video URL.");
  }

  return videoUrl;
}

async function downloadVideo(fetchFn: FetchLike, url: string): Promise<Buffer> {
  const response = await fetchFn(url);

  if (!response.ok) {
    throw new Error(`Seedance 2.0 video download failed: ${response.statusText || `HTTP ${response.status}`}.`);
  }

  const arrayBuffer = await response.arrayBuffer();
  return Buffer.from(arrayBuffer);
}

function normalizeEvolinkBaseUrl(rawBaseUrl: string): string {
  const baseUrl = rawBaseUrl.replace(/\/$/u, "");
  return baseUrl.endsWith("/v1") ? baseUrl : `${baseUrl}/v1`;
}

function normalizeBytePlusArkBaseUrl(rawBaseUrl: string): string {
  const baseUrl = rawBaseUrl.replace(/\/$/u, "");

  if (baseUrl.endsWith("/api/v3")) {
    return baseUrl;
  }

  return `${baseUrl}/api/v3`;
}

function buildBytePlusArkTaskBody(input: {
  aspectRatio: string;
  durationSeconds: number;
  lastFrameImageUrl?: string | undefined;
  model: string;
  prompt: string;
  quality: string;
  referenceImageUrls: string[];
  sourceImageUrl?: string | undefined;
}): Record<string, unknown> {
  const content: Record<string, unknown>[] = [
    {
      text: appendBytePlusPromptParameters(input.prompt, input),
      type: "text"
    }
  ];

  if (input.sourceImageUrl) {
    content.push({
      image_url: {
        url: input.sourceImageUrl
      },
      role: "first_frame",
      type: "image_url"
    });
  }

  if (input.lastFrameImageUrl) {
    content.push({
      image_url: {
        url: input.lastFrameImageUrl
      },
      role: "last_frame",
      type: "image_url"
    });
  }

  input.referenceImageUrls.slice(0, 8).forEach((url) => {
    content.push({
      image_url: {
        url
      },
      role: "reference_image",
      type: "image_url"
    });
  });

  return {
    content,
    duration: input.durationSeconds,
    generate_audio: false,
    model: input.model,
    ratio: input.aspectRatio,
    resolution: input.quality,
    watermark: false
  };
}

function appendBytePlusPromptParameters(prompt: string, input: { aspectRatio: string; durationSeconds: number; quality: string }): string {
  return [
    prompt,
    `--ratio ${input.aspectRatio}`,
    `--resolution ${input.quality}`,
    `--duration ${input.durationSeconds}`,
    "--camerafixed false"
  ].join(" ");
}

function normalizeExternalImageUrl(value: string | undefined): string | undefined {
  if (!value?.trim()) {
    return undefined;
  }

  try {
    const url = new URL(value.trim());
    const hostname = url.hostname.toLowerCase();

    if (!["http:", "https:"].includes(url.protocol) || hostname === "localhost" || hostname === "127.0.0.1" || hostname === "::1") {
      return undefined;
    }

    return url.toString();
  } catch {
    return undefined;
  }
}

function normalizeExternalImageUrls(values: string[] | undefined): string[] {
  if (!values) {
    return [];
  }

  return Array.from(new Set(values.map((value) => normalizeExternalImageUrl(value)).filter((value): value is string => Boolean(value)))).slice(0, 8);
}

function buildSeedancePrompt(prompt: string, topic: string): string {
  const normalizedPrompt = prompt.trim() || topic.trim();
  return [
    normalizedPrompt,
    "Vertical short-form video, cinematic motion, stable subject identity, smooth camera movement, no real people, no copyrighted characters."
  ].join("\n");
}

function getRuntimeSeedanceConfig(input?: GenerateVideoClipRequest | undefined): RuntimeSeedanceConfig {
  const baseUrl = input?.baseUrl?.trim() || process.env.SEEDANCE_BASE_URL || config.providers.seedance.baseUrl;
  const apiStyle = input?.apiStyle?.trim() || process.env.SEEDANCE_API_STYLE || (baseUrl.includes("evolink") ? "evolink" : config.providers.seedance.apiStyle);
  const defaultModel = process.env.SEEDANCE_MODEL ?? (apiStyle === "evolink" ? "seedance-2.0-text-to-video" : "dreamina-seedance-2-0-260128");
  const params = input?.params ?? {};

  return {
    apiKey: process.env.SEEDANCE_API_KEY ?? process.env.BYTEPLUS_ARK_API_KEY ?? process.env.ARK_API_KEY ?? process.env.EVOLINK_API_KEY ?? config.providers.seedance.apiKey,
    apiStyle,
    aspectRatio: stringParam(params.aspectRatio) || process.env.SEEDANCE_ASPECT_RATIO || config.providers.seedance.aspectRatio,
    baseUrl,
    costRMPerMillionTokens: input?.cost?.outputUnitPriceRM && input.cost.outputUnitPriceRM > 0 ? input.cost.outputUnitPriceRM : numberFromEnv("SEEDANCE_COST_RM_PER_M_TOKENS", config.providers.seedance.costRMPerMillionTokens),
    costRMPerSecond: input?.cost?.fallbackCostRM && input.cost.fallbackCostRM > 0 ? input.cost.fallbackCostRM : numberFromEnv("SEEDANCE_COST_RM_PER_SECOND", config.providers.seedance.costRMPerSecond),
    imageToVideoModel: input?.model?.trim() || process.env.SEEDANCE_IMAGE_TO_VIDEO_MODEL || defaultModel,
    pollIntervalMs: numberFromEnv("SEEDANCE_POLL_INTERVAL_MS", config.providers.seedance.pollIntervalMs),
    quality: stringParam(params.quality) || process.env.SEEDANCE_QUALITY || config.providers.seedance.quality,
    textToVideoModel: input?.model?.trim() || process.env.SEEDANCE_TEXT_TO_VIDEO_MODEL || defaultModel,
    timeoutMs: numberFromEnv("SEEDANCE_TIMEOUT_MS", config.providers.seedance.timeoutMs)
  };
}

function stringParam(value: unknown): string | undefined {
  return typeof value === "string" && value.trim() ? value.trim() : undefined;
}

function numberFromEnv(name: string, fallback: number): number {
  const raw = process.env[name];

  if (!raw) {
    return fallback;
  }

  const parsed = Number(raw);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function calculateSeedanceCostRM(durationSeconds: number, task: SeedanceTask, seedanceConfig: RuntimeSeedanceConfig, costRMPerMillionTokens: number): number {
  const tokenCostRM = task.usage?.totalTokens && costRMPerMillionTokens > 0
    ? (task.usage.totalTokens / 1_000_000) * costRMPerMillionTokens
    : undefined;
  const fallbackCostRM = durationSeconds * seedanceConfig.costRMPerSecond;

  return Number((tokenCostRM ?? fallbackCostRM).toFixed(4));
}

function getSeedanceCostRMPerMillionTokens(seedanceConfig: RuntimeSeedanceConfig, model: string): number {
  if (seedanceConfig.costRMPerMillionTokens > 0) {
    return seedanceConfig.costRMPerMillionTokens;
  }

  const usdPerMillionTokens = model.toLowerCase().includes("fast") ? 5.6 : 7;
  return Number((usdPerMillionTokens * config.currency.usdToMyrRate).toFixed(4));
}

function clampInteger(value: number, min: number, max: number): number {
  if (!Number.isFinite(value)) {
    return min;
  }

  return Math.min(max, Math.max(min, Math.round(value)));
}

function toGeneratedObject(object: StoredObject): GeneratedStorageObject {
  return {
    driver: object.driver,
    fallbackReason: object.fallbackReason,
    localPath: object.localPath,
    publicUrl: object.publicUrl,
    storagePath: object.storagePath
  };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function parseJsonResponse(text: string): unknown {
  if (!text) {
    return {};
  }

  try {
    return JSON.parse(text) as unknown;
  } catch {
    return {
      message: text
    };
  }
}

function extractVideoUrl(source: Record<string, unknown>): string | undefined {
  const directVideoUrl = stringValue(source.video_url) ?? stringValue(source.videoUrl) ?? stringValue(source.url);

  if (directVideoUrl) {
    return directVideoUrl;
  }

  const content = source.content;

  if (isRecord(content)) {
    return stringValue(content.video_url) ?? stringValue(content.videoUrl) ?? stringValue(content.url);
  }

  if (Array.isArray(content)) {
    for (const item of content) {
      if (!isRecord(item)) {
        continue;
      }

      const itemVideoUrl = stringValue(item.video_url) ?? stringValue(item.videoUrl) ?? stringValue(item.url);

      if (itemVideoUrl) {
        return itemVideoUrl;
      }
    }
  }

  return undefined;
}

function stringValue(value: unknown): string | undefined {
  return typeof value === "string" && value.trim() ? value.trim() : undefined;
}

function numberValue(value: unknown): number | undefined {
  return typeof value === "number" && Number.isFinite(value) ? value : undefined;
}

function usageValue(value: unknown): SeedanceTask["usage"] {
  if (!isRecord(value)) {
    return undefined;
  }

  return {
    completionTokens: numberValue(value.completion_tokens) ?? numberValue(value.completionTokens),
    totalTokens: numberValue(value.total_tokens) ?? numberValue(value.totalTokens)
  };
}

function arrayStringValue(value: unknown): string[] | undefined {
  return Array.isArray(value) ? value.filter((item): item is string => typeof item === "string" && item.trim().length > 0) : undefined;
}
