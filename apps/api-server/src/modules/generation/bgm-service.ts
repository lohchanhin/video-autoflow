import { existsSync } from "node:fs";
import { readFile } from "node:fs/promises";
import type { ContentTemplateType, GenerateBgmRequest, GenerateBgmResponse } from "@ai-content-factory/shared-types";
import type { StorageAdapter, StoredObject } from "@ai-content-factory/storage";
import { MissingGenerationDependencyError } from "../../errors.js";

export interface ElevenLabsMusicClientOptions {
  apiKey?: string | undefined;
  baseUrl: string;
  costRMPerMinute: number;
  model: string;
  outputFormat: string;
}

export interface BgmGenerationServiceOptions {
  elevenlabs: ElevenLabsMusicClientOptions;
  storage: StorageAdapter;
}

export interface BgmGenerationService {
  generateBgm(input: GenerateBgmRequest): Promise<GenerateBgmResponse>;
}

interface NormalizedBgmInput extends Omit<GenerateBgmRequest, "durationSeconds" | "jobId" | "mood"> {
  durationSeconds: number;
  jobId?: string;
  mood?: string;
}

interface ElevenLabsSubscriptionUsage {
  character_count?: number | undefined;
  character_limit?: number | undefined;
}

export function createBgmGenerationService(options: BgmGenerationServiceOptions): BgmGenerationService {
  return {
    async generateBgm(input: GenerateBgmRequest): Promise<GenerateBgmResponse> {
      const normalizedInput = normalizeInput(input);
      const jobId = normalizedInput.jobId ?? `job_${crypto.randomUUID().slice(0, 8)}`;
      const elevenlabsOptions = buildElevenLabsMusicOptions(options.elevenlabs, normalizedInput);

      if (!elevenlabsOptions.apiKey) {
        throw new MissingGenerationDependencyError("Missing ELEVENLABS_API_KEY. Configure ElevenLabs in Keys or .env before generating background music. No mock BGM will be generated.");
      }

      const prompt = await buildMusicPrompt(options.storage, jobId, normalizedInput);
      const creditsBefore = await fetchElevenLabsSubscriptionUsage(elevenlabsOptions);
      const generated = await generateWithElevenLabs(prompt, normalizedInput.durationSeconds, elevenlabsOptions);
      const creditsAfter = await fetchElevenLabsSubscriptionUsage(elevenlabsOptions);
      const audioObject = await options.storage.writeFile(`jobs/${jobId}/audio/bgm.${generated.extension}`, generated.buffer);
      await options.storage.writeFile(`jobs/${jobId}/audio/bgm-prompt.txt`, prompt);
      const usage = buildBgmUsage(normalizedInput.durationSeconds, creditsBefore, creditsAfter);

      return {
        audio: toGeneratedObject(audioObject),
        costRM: applyBgmCostOverride(estimateMusicCostRM(normalizedInput.durationSeconds, elevenlabsOptions.costRMPerMinute), normalizedInput),
        durationSeconds: normalizedInput.durationSeconds,
        format: generated.extension,
        jobId,
        model: elevenlabsOptions.model,
        prompt,
        provider: normalizedInput.provider?.trim() || "elevenlabs",
        songId: generated.songId,
        status: "BGM_DONE",
        usage
      };
    }
  };
}

function buildElevenLabsMusicOptions(options: ElevenLabsMusicClientOptions, input: NormalizedBgmInput): ElevenLabsMusicClientOptions {
  return {
    ...options,
    baseUrl: input.baseUrl?.trim() || options.baseUrl,
    costRMPerMinute: typeof input.cost?.outputUnitPriceRM === "number" && input.cost.outputUnitPriceRM > 0 ? input.cost.outputUnitPriceRM : options.costRMPerMinute,
    model: input.model?.trim() || options.model,
    outputFormat: stringParam(input.params?.outputFormat) || stringParam(input.params?.format) || options.outputFormat
  };
}

function applyBgmCostOverride(costRM: number, input: NormalizedBgmInput): number {
  if (costRM > 0) {
    return costRM;
  }

  return Number((input.cost?.fallbackCostRM ?? 0).toFixed(4));
}

async function fetchElevenLabsSubscriptionUsage(options: ElevenLabsMusicClientOptions): Promise<ElevenLabsSubscriptionUsage | null> {
  if (!options.apiKey) {
    return null;
  }

  try {
    const response = await fetch(`${options.baseUrl.replace(/\/$/u, "")}/user/subscription`, {
      headers: {
        "xi-api-key": options.apiKey
      },
      method: "GET"
    });

    if (!response.ok) {
      return null;
    }

    return await response.json() as ElevenLabsSubscriptionUsage;
  } catch {
    return null;
  }
}

function buildBgmUsage(durationSeconds: number, before: ElevenLabsSubscriptionUsage | null, after: ElevenLabsSubscriptionUsage | null): GenerateBgmResponse["usage"] {
  const beforeCount = typeof before?.character_count === "number" ? before.character_count : undefined;
  const afterCount = typeof after?.character_count === "number" ? after.character_count : undefined;
  const creditDelta = beforeCount !== undefined && afterCount !== undefined ? Math.max(0, afterCount - beforeCount) : undefined;

  return {
    creditsAfter: afterCount,
    creditsBefore: beforeCount,
    creditDelta,
    creditLimit: typeof after?.character_limit === "number" ? after.character_limit : typeof before?.character_limit === "number" ? before.character_limit : undefined,
    durationSeconds,
    pricingMode: creditDelta !== undefined ? "elevenlabs_credit_delta" : "duration_configured_rate"
  };
}

function normalizeInput(input: GenerateBgmRequest): NormalizedBgmInput {
  const topic = input.topic.trim();
  const prompt = input.prompt.trim();
  const durationSeconds = Math.max(3, Math.min(600, Math.round(input.durationSeconds ?? 45)));

  if (!topic) {
    throw new Error("topic is required.");
  }

  if (!prompt) {
    throw new Error("prompt is required.");
  }

  const normalized: NormalizedBgmInput = {
    costLimitRM: input.costLimitRM,
    durationSeconds,
    language: input.language,
    prompt,
    sceneCount: Math.max(1, Math.min(7, Math.round(input.sceneCount))),
    templateType: input.templateType,
    topic
  };

  if (input.apiStyle?.trim()) {
    normalized.apiStyle = input.apiStyle.trim();
  }

  if (input.baseUrl?.trim()) {
    normalized.baseUrl = input.baseUrl.trim();
  }

  if (input.cost) {
    normalized.cost = input.cost;
  }

  if (input.jobId?.trim()) {
    normalized.jobId = input.jobId.trim();
  }

  if (input.model?.trim()) {
    normalized.model = input.model.trim();
  }

  if (input.mood?.trim()) {
    normalized.mood = input.mood.trim();
  }

  if (input.params) {
    normalized.params = input.params;
  }

  if (input.provider?.trim()) {
    normalized.provider = input.provider.trim();
  }

  return normalized;
}

async function buildMusicPrompt(storage: StorageAdapter, jobId: string, input: NormalizedBgmInput): Promise<string> {
  const scriptPath = storage.resolveLocalPath(`jobs/${jobId}/script.json`);
  const title = existsSync(scriptPath) ? readScriptTitle(await readFile(scriptPath, "utf8")) : input.topic;
  const mood = input.mood ?? getTemplateMusicMood(input.templateType);

  const prompt = [
    `Instrumental background music for a ${input.durationSeconds}-second vertical YouTube Shorts video.`,
    `Topic: ${input.topic}.`,
    `Title: ${title}.`,
    `Genre/template: ${input.templateType}.`,
    `Mood: ${mood}.`,
    "No vocals, no lyrics, no spoken words.",
    "Keep the arrangement supportive under narration, with a clear intro, gentle build, and clean ending.",
    "Avoid copyrighted melodies, recognizable themes, logos, or artist imitation.",
    `Production brief: ${input.prompt}.`
  ].join(" ");

  return prompt.length <= 4100 ? prompt : `${prompt.slice(0, 4097)}...`;
}

function readScriptTitle(rawJson: string): string {
  const parsed = JSON.parse(rawJson) as { title?: string };
  return parsed.title?.trim() || "Untitled short";
}

function getTemplateMusicMood(templateType: ContentTemplateType): string {
  const moods: Record<ContentTemplateType, string> = {
    comedy_sketch: "light playful pizzicato, subtle upbeat rhythm, clean comedic timing",
    fairy_tale: "warm whimsical orchestral, soft bells, gentle magical wonder",
    romance_story: "warm cinematic piano, soft strings, restrained emotional lift",
    rules_horror: "dark ambient drone, sparse pulses, low tension, no jumpscare stingers",
    surveillance_horror: "cold electronic suspense bed, low hum, subtle analog texture",
    urban_legend: "moody modern mystery, soft pulse, cinematic nocturnal atmosphere"
  };

  return moods[templateType];
}

function stringParam(value: unknown): string | undefined {
  return typeof value === "string" && value.trim() ? value.trim() : undefined;
}

async function generateWithElevenLabs(
  prompt: string,
  durationSeconds: number,
  options: ElevenLabsMusicClientOptions
): Promise<{ buffer: Buffer; extension: string; songId?: string | undefined }> {
  const url = new URL(`${options.baseUrl.replace(/\/$/u, "")}/music`);

  if (options.outputFormat.trim()) {
    url.searchParams.set("output_format", options.outputFormat.trim());
  }

  const response = await fetch(url, {
    body: JSON.stringify({
      force_instrumental: true,
      model_id: options.model,
      music_length_ms: Math.round(durationSeconds * 1000),
      prompt
    }),
    headers: {
      "Content-Type": "application/json",
      "xi-api-key": options.apiKey ?? ""
    },
    method: "POST"
  });

  if (!response.ok) {
    throw new Error(`ElevenLabs music generation failed: ${await extractErrorMessage(response)}`);
  }

  const buffer = Buffer.from(await response.arrayBuffer());

  if (buffer.length === 0) {
    throw new Error("ElevenLabs music generation returned an empty audio file.");
  }

  return {
    buffer,
    extension: extensionFromResponse(response, options.outputFormat),
    songId: response.headers.get("song-id") ?? undefined
  };
}

async function extractErrorMessage(response: Response): Promise<string> {
  const contentType = response.headers.get("content-type") ?? "";

  if (contentType.includes("application/json")) {
    const body = (await response.json().catch(() => ({}))) as unknown;
    const message = extractJsonErrorMessage(body);
    return message ? `${normalizeElevenLabsErrorMessage(message)} (HTTP ${response.status})` : `${safeStringify(body) || response.statusText} (HTTP ${response.status})`;
  }

  const text = (await response.text().catch(() => "")).trim() || response.statusText;
  return normalizeElevenLabsErrorMessage(text);
}

function extractJsonErrorMessage(value: unknown): string | null {
  if (typeof value === "string") {
    return value;
  }

  if (Array.isArray(value)) {
    return formatValidationDetail(value) ?? safeStringify(value);
  }

  if (!value || typeof value !== "object") {
    return null;
  }

  const record = value as Record<string, unknown>;
  const candidates = [
    record.message,
    record.error,
    record.detail,
    record.reason
  ];

  for (const candidate of candidates) {
    if (typeof candidate === "string" && candidate.trim()) {
      return candidate.trim();
    }

    const nested = extractJsonErrorMessage(candidate);
    if (nested) {
      return nested;
    }
  }

  const validationDetail = formatValidationDetail(record.detail);
  if (validationDetail) {
    return validationDetail;
  }

  return null;
}

function formatValidationDetail(value: unknown): string | null {
  if (!Array.isArray(value)) {
    return null;
  }

  const messages = value
    .map((item) => {
      if (!item || typeof item !== "object") {
        return typeof item === "string" ? item : "";
      }

      const record = item as Record<string, unknown>;
      const location = Array.isArray(record.loc) ? record.loc.join(".") : "";
      const message = typeof record.msg === "string" ? record.msg : safeStringify(record);
      return location ? `${location}: ${message}` : message;
    })
    .filter(Boolean);

  return messages.length > 0 ? messages.join("; ") : null;
}

function normalizeElevenLabsErrorMessage(message: string): string {
  const trimmed = message.trim();
  const quotaMatch = /exceeds your API key \(([^)]+)\) quota of ([\d,]+).*?You have ([\d,]+) credits remaining, while ([\d,]+) credits are required/iu.exec(trimmed);

  if (quotaMatch) {
    const [, keyName, keyLimit, remainingCredits, requiredCredits] = quotaMatch;
    return [
      trimmed,
      `这是 ElevenLabs API key「${keyName}」自己的用量上限，不是账户 top-up balance。`,
      `这把 key 的 quota 是 ${keyLimit} credits，目前剩 ${remainingCredits}，本次 BGM 需要 ${requiredCredits}。`,
      "请到 ElevenLabs > API Keys 编辑这把 key，把 Usage Limits / Monthly credits 调高或设为 Unlimited；也可以缩短 BGM 时长后重试。"
    ].join(" ");
  }

  return trimmed;
}

function safeStringify(value: unknown): string {
  try {
    return JSON.stringify(value);
  } catch {
    return String(value);
  }
}

function extensionFromResponse(response: Response, outputFormat: string): string {
  const contentType = response.headers.get("content-type") ?? "";

  if (contentType.includes("wav")) {
    return "wav";
  }

  if (contentType.includes("ogg")) {
    return "ogg";
  }

  if (contentType.includes("mpeg") || contentType.includes("mp3")) {
    return "mp3";
  }

  const format = outputFormat.toLowerCase();

  if (format.startsWith("wav") || format.startsWith("pcm")) {
    return "wav";
  }

  if (format.startsWith("ogg") || format.startsWith("opus")) {
    return "ogg";
  }

  return "mp3";
}

function estimateMusicCostRM(durationSeconds: number, costRMPerMinute: number): number {
  return Number(((durationSeconds / 60) * Math.max(0, costRMPerMinute)).toFixed(4));
}

function toGeneratedObject(object: StoredObject): GenerateBgmResponse["audio"] {
  return {
    driver: object.driver,
    fallbackReason: object.fallbackReason,
    localPath: object.localPath,
    publicUrl: object.publicUrl,
    storagePath: object.storagePath
  };
}
