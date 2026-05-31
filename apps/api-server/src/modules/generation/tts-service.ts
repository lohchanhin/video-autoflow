import { existsSync } from "node:fs";
import { readFile } from "node:fs/promises";
import type { GenerateTtsRequest, GenerateTtsResponse } from "@ai-content-factory/shared-types";
import type { StorageAdapter, StoredObject } from "@ai-content-factory/storage";
import { MissingGenerationDependencyError } from "../../errors.js";

export interface OpenAITtsClientOptions {
  apiKey?: string | undefined;
  baseUrl: string;
  costUsdPer1KChars: number;
  format: string;
  model: string;
  usdToMyrRate: number;
  voice: string;
}

export interface TtsGenerationServiceOptions {
  openai: OpenAITtsClientOptions;
  storage: StorageAdapter;
}

export interface TtsGenerationService {
  generateTts(input: GenerateTtsRequest): Promise<GenerateTtsResponse>;
}

interface NormalizedTtsInput extends Omit<GenerateTtsRequest, "jobId" | "voice"> {
  jobId?: string;
  voice?: string;
}

export function createTtsGenerationService(options: TtsGenerationServiceOptions): TtsGenerationService {
  return {
    async generateTts(input: GenerateTtsRequest): Promise<GenerateTtsResponse> {
      const normalizedInput = normalizeInput(input);
      const jobId = normalizedInput.jobId ?? `job_${crypto.randomUUID().slice(0, 8)}`;
      const openaiOptions = buildOpenAITtsOptions(options.openai, normalizedInput);
      const voice = normalizedInput.voice ?? stringParam(normalizedInput.params?.voice) ?? openaiOptions.voice;
      const voiceoverText = await loadStoryboardVoiceoverText(options.storage, jobId, normalizedInput.voiceoverText);

      if (!openaiOptions.apiKey) {
        throw new MissingGenerationDependencyError("Missing OPENAI_API_KEY. Configure the OpenAI key in Keys or .env before generating voiceover audio. No mock narration audio will be generated.");
      }

      const generated = await generateWithOpenAI(voiceoverText, voice, openaiOptions);
      const basePath = `jobs/${jobId}`;
      const audioObject = await options.storage.writeFile(`${basePath}/audio/voiceover.${generated.extension}`, generated.buffer);
      await options.storage.writeFile(`${basePath}/audio/voiceover.txt`, voiceoverText);

      return {
        audio: toGeneratedObject(audioObject),
        costRM: applyTtsCostOverride(generated.costRM, normalizedInput),
        format: generated.extension,
        jobId,
        model: openaiOptions.model,
        provider: normalizedInput.provider?.trim() || "openai",
        status: "TTS_DONE",
        usage: {
          characterCount: voiceoverText.length,
          pricingMode: "character_count"
        },
        voice,
        voiceoverText
      };
    }
  };
}

function buildOpenAITtsOptions(options: OpenAITtsClientOptions, input: NormalizedTtsInput): OpenAITtsClientOptions {
  return {
    ...options,
    baseUrl: input.baseUrl?.trim() || options.baseUrl,
    format: stringParam(input.params?.format) || options.format,
    model: input.model?.trim() || options.model,
    voice: input.voice ?? stringParam(input.params?.voice) ?? options.voice
  };
}

function applyTtsCostOverride(costRM: number, input: NormalizedTtsInput): number {
  if (costRM > 0) {
    return costRM;
  }

  return Number((input.cost?.fallbackCostRM ?? 0).toFixed(4));
}

async function loadStoryboardVoiceoverText(storage: StorageAdapter, jobId: string, fallbackText: string): Promise<string> {
  const storyboardPath = storage.resolveLocalPath(`jobs/${jobId}/storyboard.json`);

  if (!existsSync(storyboardPath)) {
    return fallbackText;
  }

  const parsed = JSON.parse(await readFile(storyboardPath, "utf8")) as { scenes?: Array<{ sceneId?: number; voiceText?: string }> };
  const sceneVoiceText = parsed.scenes
    ?.slice()
    .sort((a, b) => (a.sceneId ?? 0) - (b.sceneId ?? 0))
    .map((scene) => scene.voiceText?.trim() ?? "")
    .filter(Boolean)
    .join("\n");

  return sceneVoiceText || fallbackText;
}

async function generateWithOpenAI(
  input: string,
  voice: string,
  options: OpenAITtsClientOptions
): Promise<{ buffer: Buffer; costRM: number; extension: string }> {
  const extension = normalizeAudioFormat(options.format);
  const response = await fetch(`${options.baseUrl.replace(/\/$/u, "")}/audio/speech`, {
    body: JSON.stringify({
      input,
      model: options.model,
      response_format: extension,
      voice
    }),
    headers: {
      Authorization: `Bearer ${options.apiKey}`,
      "Content-Type": "application/json"
    },
    method: "POST"
  });

  if (!response.ok) {
    throw new Error(`OpenAI TTS generation failed: ${await extractErrorMessage(response)}`);
  }

  const buffer = Buffer.from(await response.arrayBuffer());

  if (buffer.length === 0) {
    throw new Error("OpenAI TTS generation returned an empty audio file.");
  }

  return {
    buffer,
    costRM: estimateTtsCostRM(input, options.costUsdPer1KChars, options.usdToMyrRate),
    extension
  };
}

function normalizeInput(input: GenerateTtsRequest): NormalizedTtsInput {
  const voiceoverText = input.voiceoverText.trim();

  if (!voiceoverText) {
    throw new Error("voiceoverText is required.");
  }

  const normalized: NormalizedTtsInput = {
    costLimitRM: Number.isFinite(input.costLimitRM) ? input.costLimitRM : 7.5,
    language: input.language === "en-US" ? "en-US" : "zh-CN",
    voiceoverText
  };

  if (input.jobId?.trim()) {
    normalized.jobId = input.jobId.trim();
  }

  if (input.voice?.trim()) {
    normalized.voice = input.voice.trim();
  }

  return normalized;
}

function normalizeAudioFormat(format: string): string {
  const normalized = format.trim().toLowerCase();
  return ["mp3", "opus", "aac", "flac", "wav", "pcm"].includes(normalized) ? normalized : "mp3";
}

function stringParam(value: unknown): string | undefined {
  return typeof value === "string" && value.trim() ? value.trim() : undefined;
}

async function extractErrorMessage(response: Response): Promise<string> {
  const contentType = response.headers.get("content-type") ?? "";

  if (contentType.includes("application/json")) {
    const body = (await response.json().catch(() => ({}))) as { error?: { message?: string } };
    return body.error?.message ?? response.statusText;
  }

  return (await response.text().catch(() => "")).trim() || response.statusText;
}

function estimateTtsCostRM(input: string, costUsdPer1KChars: number, usdToMyrRate: number): number {
  const usd = (input.length / 1_000) * costUsdPer1KChars;
  return Number((usd * usdToMyrRate).toFixed(4));
}

function toGeneratedObject(object: StoredObject): GenerateTtsResponse["audio"] {
  return {
    driver: object.driver,
    fallbackReason: object.fallbackReason,
    localPath: object.localPath,
    publicUrl: object.publicUrl,
    storagePath: object.storagePath
  };
}
