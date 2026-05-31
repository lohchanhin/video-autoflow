import type {
  BootstrapProductionAssetsResponse,
  ContentSeries,
  ContentSeriesResponse,
  ConvertSeriesEpisodeToCaseResponse,
  CostSummaryResponse,
  DatabaseStatusResponse,
  GenerateBgmResponse,
  GenerateProductionAssetResponse,
  GenerateImagesResponse,
  GenerateQcReportResponse,
  GenerateReferenceDesignResponse,
  GenerateSceneImageResponse,
  GenerateScriptStoryRequest,
  GenerateScriptStoryResponse,
  GenerateTtsResponse,
  GenerateVideoClipResponse,
  GenerateVideoResponse,
  GenerationReferenceAsset,
  ListCostLogsResponse,
  ListContentSeriesResponse,
  ListProductionAssetsResponse,
  ListSeriesEpisodeIdeasResponse,
  ProductionAsset,
  ProductionAssetProvider,
  ProductionAssetRole,
  ProductionAssetStatus,
  ProductionAssetType,
  ProviderModelsResponse,
  ProviderSecretStatusResponse,
  SeriesEpisodeIdea,
  SeriesEpisodeIdeaResponse,
  ToolProviderOverride,
  TrendScanRequest,
  TrendScanResponse
} from "@ai-content-factory/shared-types";
import type { AdminJob } from "./jobs.js";
import type { CharacterProfile } from "./admin-data.js";

export const apiBaseUrl = (import.meta.env.VITE_API_BASE_URL || getDefaultApiBaseUrl()).replace(/\/$/u, "");

function getDefaultApiBaseUrl(): string {
  if (window.location.hostname && window.location.hostname !== "127.0.0.1" && window.location.hostname !== "localhost") {
    return `${window.location.protocol}//${window.location.hostname}:4000`;
  }

  return "http://127.0.0.1:4000";
}

async function fetchJson<T>(path: string, init: RequestInit | undefined, fallbackMessage: string): Promise<T> {
  let response: Response;

  try {
    response = await fetch(`${apiBaseUrl}${path}`, init);
  } catch {
    throw new Error(`${fallbackMessage}: API server is offline at ${apiBaseUrl}. Start it with pnpm dev:api or restart pnpm dev.`);
  }

  if (!response.ok) {
    const errorBody = (await response.json().catch(() => null)) as { error?: { message?: string } } | null;
    throw new Error(errorBody?.error?.message ?? `${fallbackMessage} with HTTP ${response.status}.`);
  }

  return (await response.json()) as T;
}

export async function generateVideo(job: AdminJob, tool?: ToolProviderOverride | undefined): Promise<GenerateVideoResponse> {
  return fetchJson<GenerateVideoResponse>(
    "/generation/video",
    {
      body: JSON.stringify({
        costLimitRM: job.costLimitRM,
        durationSeconds: job.durationSeconds,
        genre: job.genre,
        jobId: job.id,
        language: job.language,
        prompt: job.prompt,
        sceneCount: job.sceneCount,
        templateType: job.templateType,
        topic: job.topic,
        ...tool
      }),
      headers: {
        "Content-Type": "application/json"
      },
      method: "POST"
    },
    "Video generation failed"
  );
}

export async function getCostSummary(jobId?: string | undefined): Promise<CostSummaryResponse> {
  const query = jobId ? `?jobId=${encodeURIComponent(jobId)}` : "";
  return fetchJson<CostSummaryResponse>(`/costs/summary${query}`, undefined, "Cost summary load failed");
}

export async function listCostLogs(input: { jobId?: string | undefined; limit?: number | undefined } = {}): Promise<ListCostLogsResponse> {
  const params = new URLSearchParams();

  if (input.jobId) params.set("jobId", input.jobId);
  if (input.limit) params.set("limit", String(input.limit));

  const query = params.toString() ? `?${params.toString()}` : "";
  return fetchJson<ListCostLogsResponse>(`/costs/logs${query}`, undefined, "Cost logs load failed");
}

export async function generateVideoClip(job: AdminJob, input: { durationSeconds?: number | undefined; imageUrl?: string | undefined; lastFrameImageUrl?: string | undefined; prompt: string; referenceImageUrls?: string[] | undefined; sceneId: number }, tool?: ToolProviderOverride | undefined): Promise<GenerateVideoClipResponse> {
  return fetchJson<GenerateVideoClipResponse>(
    "/generation/video-clips/scene",
    {
      body: JSON.stringify({
        aspectRatio: "9:16",
        costLimitRM: job.costLimitRM,
        durationSeconds: input.durationSeconds ?? 5,
        imageUrl: input.imageUrl,
        jobId: job.id,
        lastFrameImageUrl: input.lastFrameImageUrl,
        prompt: input.prompt,
        quality: "720p",
        referenceImageUrls: input.referenceImageUrls,
        sceneId: input.sceneId,
        topic: job.topic,
        ...tool
      }),
      headers: {
        "Content-Type": "application/json"
      },
      method: "POST"
    },
    "Seedance video clip generation failed"
  );
}

function characterPayload(character: CharacterProfile | null | undefined) {
  if (!character) {
    return undefined;
  }

  return {
    name: character.name,
    referenceNotes: [
      character.outfitLock ? `Outfit lock: ${character.outfitLock}` : "",
      character.styleLock ? `Style lock: ${character.styleLock}` : "",
      character.referenceImageUrl ? `Reference image URL: ${character.referenceImageUrl}` : "",
      character.notes
    ].filter(Boolean).join("\n"),
    visualIdentity: character.visualIdentity
  };
}

export async function generateImages(job: AdminJob, character?: CharacterProfile | null, references?: GenerationReferenceAsset[] | undefined, tool?: ToolProviderOverride | undefined): Promise<GenerateImagesResponse> {
  return fetchJson<GenerateImagesResponse>(
    "/generation/images",
    {
      body: JSON.stringify({
        character: characterPayload(character),
        costLimitRM: job.costLimitRM,
        jobId: job.id,
        language: job.language,
        prompt: job.prompt,
        references,
        sceneCount: job.sceneCount,
        templateType: job.templateType,
        topic: job.topic,
        ...tool
      }),
      headers: {
        "Content-Type": "application/json"
      },
      method: "POST"
    },
    "Image generation failed"
  );
}

export async function generateSceneImage(job: AdminJob, sceneId: number, promptOverride: string, character?: CharacterProfile | null, references?: GenerationReferenceAsset[] | undefined, tool?: ToolProviderOverride | undefined): Promise<GenerateSceneImageResponse> {
  return fetchJson<GenerateSceneImageResponse>(
    "/generation/images/scene",
    {
      body: JSON.stringify({
        character: characterPayload(character),
        costLimitRM: job.costLimitRM,
        jobId: job.id,
        language: job.language,
        prompt: job.prompt,
        promptOverride,
        references,
        sceneCount: job.sceneCount,
        sceneId,
        templateType: job.templateType,
        topic: job.topic,
        ...tool
      }),
      headers: {
        "Content-Type": "application/json"
      },
      method: "POST"
    },
    `Scene ${sceneId} image generation failed`
  );
}

export async function generateReferenceDesign(job: AdminJob, input: { designType: "character_design" | "scene_design"; sceneId?: number | undefined }, tool?: ToolProviderOverride | undefined): Promise<GenerateReferenceDesignResponse> {
  return fetchJson<GenerateReferenceDesignResponse>(
    "/generation/reference-designs",
    {
      body: JSON.stringify({
        costLimitRM: job.costLimitRM,
        designType: input.designType,
        jobId: job.id,
        language: job.language,
        prompt: job.prompt,
        sceneCount: job.sceneCount,
        sceneId: input.sceneId,
        templateType: job.templateType,
        topic: job.topic,
        ...tool
      }),
      headers: {
        "Content-Type": "application/json"
      },
      method: "POST"
    },
    input.designType === "character_design" ? "Character design generation failed" : "Scene design generation failed"
  );
}

export async function generateTts(job: AdminJob, voiceoverText: string, tool?: ToolProviderOverride | undefined): Promise<GenerateTtsResponse> {
  return fetchJson<GenerateTtsResponse>(
    "/generation/tts",
    {
      body: JSON.stringify({
        costLimitRM: job.costLimitRM,
        jobId: job.id,
        language: job.language,
        voiceoverText,
        ...tool
      }),
      headers: {
        "Content-Type": "application/json"
      },
      method: "POST"
    },
    "Voiceover generation failed"
  );
}

export async function generateBgm(job: AdminJob, tool?: ToolProviderOverride | undefined): Promise<GenerateBgmResponse> {
  return fetchJson<GenerateBgmResponse>(
    "/generation/bgm",
    {
      body: JSON.stringify({
        costLimitRM: job.costLimitRM,
        durationSeconds: job.durationSeconds,
        jobId: job.id,
        language: job.language,
        prompt: job.prompt,
        sceneCount: job.sceneCount,
        templateType: job.templateType,
        topic: job.topic,
        ...tool
      }),
      headers: {
        "Content-Type": "application/json"
      },
      method: "POST"
    },
    "Background music generation failed"
  );
}

export async function generateScriptStory(job: AdminJob, tool?: ToolProviderOverride | undefined): Promise<GenerateScriptStoryResponse> {
  return generateScriptStoryFromInput({
    costLimitRM: job.costLimitRM,
    durationSeconds: job.durationSeconds,
    genre: job.genre,
    jobId: job.id,
    language: job.language,
    prompt: job.prompt,
    sceneCount: job.sceneCount,
    templateType: job.templateType,
    topic: job.topic,
    ...tool
  });
}

export async function generateScriptStoryFromInput(input: GenerateScriptStoryRequest, tool?: ToolProviderOverride | undefined): Promise<GenerateScriptStoryResponse> {
  return fetchJson<GenerateScriptStoryResponse>(
    "/generation/script",
    {
      body: JSON.stringify({ ...input, ...tool }),
      headers: {
        "Content-Type": "application/json"
      },
      method: "POST"
    },
    "Script generation failed"
  );
}

export async function generateQcReport(job: AdminJob, artifacts: {
  bgm?: string | undefined;
  finalVideo?: string | undefined;
  sceneImages: string[];
  subtitles?: string | undefined;
  voiceover?: string | undefined;
}): Promise<GenerateQcReportResponse> {
  return fetchJson<GenerateQcReportResponse>(
    "/generation/qc",
    {
      body: JSON.stringify({
        actualCostRM: job.actualCostRM,
        artifacts,
        costLimitRM: job.costLimitRM,
        jobId: job.id,
        sceneCount: job.sceneCount
      }),
      headers: {
        "Content-Type": "application/json"
      },
      method: "POST"
    },
    "QC report generation failed"
  );
}

export async function getProviderSecretStatuses(): Promise<ProviderSecretStatusResponse> {
  return fetchJson<ProviderSecretStatusResponse>("/provider-keys/status", undefined, "Provider key status failed");
}

export async function saveProviderSecretToApi(keyName: string, value: string): Promise<{ configured: boolean; keyName: string; lastFour?: string | undefined }> {
  return fetchJson<{ configured: boolean; keyName: string; lastFour?: string | undefined }>(
    "/provider-keys",
    {
      body: JSON.stringify({ keyName, value }),
      headers: {
        "Content-Type": "application/json"
      },
      method: "POST"
    },
    "Provider key save failed"
  );
}

export async function listOpenAIModels(toolType: string): Promise<ProviderModelsResponse> {
  const query = toolType ? `?toolType=${encodeURIComponent(toolType)}` : "";
  return fetchJson<ProviderModelsResponse>(`/providers/openai/models${query}`, undefined, "OpenAI model sync failed");
}

export async function getDatabaseStatus(): Promise<DatabaseStatusResponse> {
  return fetchJson<DatabaseStatusResponse>("/database/status", undefined, "Database status failed");
}

export async function listProductionAssets(filter: { jobId?: string | undefined; status?: ProductionAssetStatus | "" | undefined; type?: ProductionAssetType | "" | undefined } = {}): Promise<ListProductionAssetsResponse> {
  const params = new URLSearchParams();
  if (filter.jobId) params.set("jobId", filter.jobId);
  if (filter.status) params.set("status", filter.status);
  if (filter.type) params.set("type", filter.type);
  const query = params.toString();

  return fetchJson<ListProductionAssetsResponse>(`/assets/production${query ? `?${query}` : ""}`, undefined, "Production assets load failed");
}

export async function bootstrapProductionAssets(input: { includeLastFrames?: boolean | undefined; jobId: string; prompt?: string | undefined; sceneCount: number; topic: string }): Promise<BootstrapProductionAssetsResponse> {
  return fetchJson<BootstrapProductionAssetsResponse>(
    "/assets/production/bootstrap-case",
    {
      body: JSON.stringify(input),
      headers: {
        "Content-Type": "application/json"
      },
      method: "POST"
    },
    "Production asset plan bootstrap failed"
  );
}

export async function createProductionAsset(input: {
  costRM?: number | undefined;
  error?: string | undefined;
  folderName?: string | undefined;
  jobId: string;
  label: string;
  notes?: string | undefined;
  prompt?: string | undefined;
  provider?: ProductionAssetProvider | undefined;
  role?: ProductionAssetRole | undefined;
  sceneId?: number | null | undefined;
  scope?: "case" | "scene" | undefined;
  status?: ProductionAssetStatus | undefined;
  storagePath?: string | undefined;
  tags?: string[] | undefined;
  type: ProductionAssetType;
  url?: string | undefined;
}): Promise<{ asset: ProductionAsset }> {
  return fetchJson<{ asset: ProductionAsset }>(
    "/assets/production",
    {
      body: JSON.stringify(input),
      headers: {
        "Content-Type": "application/json"
      },
      method: "POST"
    },
    "Production asset create failed"
  );
}

export async function patchProductionAsset(id: string, patch: Partial<Pick<ProductionAsset, "costRM" | "error" | "folderName" | "label" | "notes" | "prompt" | "provider" | "role" | "sceneId" | "scope" | "status" | "storagePath" | "tags" | "type" | "url">>): Promise<{ asset: ProductionAsset }> {
  return fetchJson<{ asset: ProductionAsset }>(
    `/assets/production/${encodeURIComponent(id)}`,
    {
      body: JSON.stringify(patch),
      headers: {
        "Content-Type": "application/json"
      },
      method: "PATCH"
    },
    "Production asset update failed"
  );
}

export async function deleteProductionAsset(id: string): Promise<void> {
  const response = await fetch(`${apiBaseUrl}/assets/production/${encodeURIComponent(id)}`, { method: "DELETE" }).catch(() => null);

  if (!response) {
    throw new Error(`Production asset delete failed: API server is offline at ${apiBaseUrl}. Start it with pnpm dev:api or restart pnpm dev.`);
  }

  if (!response.ok) {
    const errorBody = (await response.json().catch(() => null)) as { error?: { message?: string } } | null;
    throw new Error(errorBody?.error?.message ?? `Production asset delete failed with HTTP ${response.status}.`);
  }
}

export async function generateProductionAsset(asset: ProductionAsset, job: AdminJob | null, tool?: ToolProviderOverride | undefined): Promise<GenerateProductionAssetResponse> {
  return fetchJson<GenerateProductionAssetResponse>(
    `/assets/production/${encodeURIComponent(asset._id)}/generate`,
    {
      body: JSON.stringify({
        costLimitRM: job?.costLimitRM ?? 7.5,
        jobId: asset.jobId,
        language: job?.language ?? "zh-CN",
        prompt: asset.prompt || job?.prompt || asset.label,
        sceneCount: job?.sceneCount ?? Math.max(asset.sceneId ?? 1, 5),
        templateType: job?.templateType ?? "urban_legend",
        topic: job?.topic ?? asset.label,
        ...tool
      }),
      headers: {
        "Content-Type": "application/json"
      },
      method: "POST"
    },
    "Production asset generation failed"
  );
}

export async function listContentSeries(): Promise<ListContentSeriesResponse> {
  return fetchJson<ListContentSeriesResponse>("/series", undefined, "Series load failed");
}

export async function createContentSeries(input: Partial<ContentSeries> & { name: string }): Promise<ContentSeriesResponse> {
  return fetchJson<ContentSeriesResponse>(
    "/series",
    {
      body: JSON.stringify(input),
      headers: {
        "Content-Type": "application/json"
      },
      method: "POST"
    },
    "Series create failed"
  );
}

export async function patchContentSeries(id: string, patch: Partial<Omit<ContentSeries, "_id" | "createdAt" | "updatedAt">>): Promise<ContentSeriesResponse> {
  return fetchJson<ContentSeriesResponse>(
    `/series/${encodeURIComponent(id)}`,
    {
      body: JSON.stringify(patch),
      headers: {
        "Content-Type": "application/json"
      },
      method: "PATCH"
    },
    "Series update failed"
  );
}

export async function deleteContentSeries(id: string): Promise<void> {
  const response = await fetch(`${apiBaseUrl}/series/${encodeURIComponent(id)}`, { method: "DELETE" }).catch(() => null);

  if (!response) {
    throw new Error(`Series delete failed: API server is offline at ${apiBaseUrl}. Start it with pnpm dev:api or restart pnpm dev.`);
  }

  if (!response.ok) {
    const errorBody = (await response.json().catch(() => null)) as { error?: { message?: string } } | null;
    throw new Error(errorBody?.error?.message ?? `Series delete failed with HTTP ${response.status}.`);
  }
}

export async function listSeriesEpisodes(seriesId: string): Promise<ListSeriesEpisodeIdeasResponse> {
  return fetchJson<ListSeriesEpisodeIdeasResponse>(`/series/${encodeURIComponent(seriesId)}/episodes`, undefined, "Series episodes load failed");
}

export async function generateSeriesEpisodeIdeas(seriesId: string, count: number): Promise<{
  costRM: number;
  episodes: SeriesEpisodeIdea[];
  model: string;
  provider: "openai" | "local";
  status: "EPISODE_IDEAS_GENERATED";
  usage?: { inputTokens: number; outputTokens: number } | undefined;
}> {
  return fetchJson(
    `/series/${encodeURIComponent(seriesId)}/episodes/generate`,
    {
      body: JSON.stringify({ count }),
      headers: {
        "Content-Type": "application/json"
      },
      method: "POST"
    },
    "Series episode idea generation failed"
  );
}

export async function patchSeriesEpisodeIdea(seriesId: string, episodeId: string, patch: Partial<Omit<SeriesEpisodeIdea, "_id" | "createdAt" | "seriesId" | "updatedAt">>): Promise<SeriesEpisodeIdeaResponse> {
  return fetchJson<SeriesEpisodeIdeaResponse>(
    `/series/${encodeURIComponent(seriesId)}/episodes/${encodeURIComponent(episodeId)}`,
    {
      body: JSON.stringify(patch),
      headers: {
        "Content-Type": "application/json"
      },
      method: "PATCH"
    },
    "Series episode update failed"
  );
}

export async function convertSeriesEpisodeToCase(seriesId: string, episodeId: string, caseId: string): Promise<ConvertSeriesEpisodeToCaseResponse> {
  return fetchJson<ConvertSeriesEpisodeToCaseResponse>(
    `/series/${encodeURIComponent(seriesId)}/episodes/${encodeURIComponent(episodeId)}/convert-case`,
    {
      body: JSON.stringify({ caseId }),
      headers: {
        "Content-Type": "application/json"
      },
      method: "POST"
    },
    "Series episode convert failed"
  );
}

export async function scanTrends(input: TrendScanRequest): Promise<TrendScanResponse> {
  return fetchJson<TrendScanResponse>(
    "/trends/scan",
    {
      body: JSON.stringify(input),
      headers: {
        "Content-Type": "application/json"
      },
      method: "POST"
    },
    "Trend scan failed"
  );
}
