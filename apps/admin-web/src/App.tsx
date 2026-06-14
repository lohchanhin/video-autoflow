import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import {
  Activity,
  BookOpen,
  Bot,
  CalendarClock,
  CheckCircle2,
  CircleDollarSign,
  Database,
  FilePenLine,
  FileVideo,
  KeyRound,
  LayoutDashboard,
  Link2,
  RefreshCw,
  Search,
  ShieldCheck,
  Workflow,
  XCircle
} from "lucide-react";
import type { ContentSeries, DatabaseStatusResponse, GenerateBgmResponse, GeneratedImageAsset, GenerateImagesResponse, GenerateQcReportResponse, GenerateScriptStoryResponse, GenerateTtsResponse, GenerateVideoClipResponse, GenerateVideoResponse, GenerationReferenceAsset, HealthResponse, JobStatus, ProductionAsset, ProductionAssetStatus, ProductionAssetType, ProductionBrief, SeriesEpisodeIdea, StoryWorld, ToolProviderOverride, TrendIdeaSeed } from "@ai-content-factory/shared-types";
import { AgentsPage } from "./pages/AgentsPage.js";
import { AssetsPage } from "./pages/AssetsPage.js";
import { AutomationPage } from "./pages/AutomationPage.js";
import { CasesPage } from "./pages/CasesPage.js";
import { DashboardPage } from "./pages/DashboardPage.js";
import { CostPage, KeysPage, StoragePage, YouTubePage } from "./pages/SettingsPages.js";
import { SeriesPage } from "./pages/SeriesPage.js";
import { TrendRadarPage } from "./pages/TrendRadarPage.js";
import { WorkflowPage } from "./pages/WorkflowPage.js";
import {
  applyProviderSecret,
  calculateNextRunAt,
  createCasePublishTargets,
  createCaseQcReport,
  createPublishingTarget,
  createScheduleRun,
  createTrendReport,
  createYouTubeAccount,
  isSameLocalDay,
  buildToolProviderOverride,
  findToolProviderSettings,
  loadAiToolEndpoints,
  loadBudgetSettings,
  loadCasePublishTargets,
  loadCaseQcReports,
  loadCharacterProfiles,
  loadProviderKeys,
  loadProductionSchedules,
  loadPublishingTargets,
  loadScheduleRuns,
  loadStorageSettings,
  loadStoredVideos,
  loadToolProviderSettings,
  loadTrendReports,
  loadYouTubeAccounts,
  resetAiToolEndpoints,
  resetProviderKeys,
  resetToolProviderSettings,
  saveAiToolEndpoints,
  saveBudgetSettings,
  saveCasePublishTargets,
  saveCaseQcReports,
  saveCharacterProfiles,
  saveProviderKeys,
  saveProductionSchedules,
  savePublishingTargets,
  saveScheduleRuns,
  saveStorageSettings,
  saveStoredVideos,
  saveToolProviderSettings,
  saveTrendReports,
  saveYouTubeAccounts,
  type AiToolEndpoint,
  type BudgetSettings,
  type CaseQcReport,
  type CasePublishTarget,
  type CharacterProfile,
  type ProviderKeyRecord,
  type ProductionSchedule,
  type PublishingTarget,
  type ScheduleRun,
  type StorageSettings,
  type StoredVideo,
  type ToolProviderSettings,
  type ToolProviderType,
  type TrendReport,
  type YouTubeAccount
} from "./lib/admin-data.js";
import {
  generateScriptStory as requestScriptStoryGeneration,
  generateScriptStoryFromInput as requestDraftScriptStoryGeneration,
  generateSceneImage as requestSceneImageGeneration,
  generateBgm as requestBgmGeneration,
  generateQcReport as requestQcReport,
  generateTts as requestTtsGeneration,
  generateVideoClip as requestVideoClipGeneration,
  generateVideo as requestVideoGeneration,
  apiBaseUrl,
  bootstrapProductionAssets as requestBootstrapProductionAssets,
  convertSeriesEpisodeToCase as requestConvertSeriesEpisodeToCase,
  createContentSeries as requestCreateContentSeries,
  createProductionAsset as requestCreateProductionAsset,
  createStoryWorld as requestCreateStoryWorld,
  deleteContentSeries as requestDeleteContentSeries,
  deleteProductionAsset as requestDeleteProductionAsset,
  deleteSeriesEpisodeIdea as requestDeleteSeriesEpisodeIdea,
  generateSeriesEpisodeIdeas as requestGenerateSeriesEpisodeIdeas,
  generateProductionAsset as requestProductionAssetGeneration,
  getDatabaseStatus,
  getProviderSecretStatuses,
  listStoryWorlds as requestStoryWorlds,
  listContentSeries as requestContentSeries,
  listSeriesEpisodes as requestSeriesEpisodes,
  listProductionAssets as requestProductionAssets,
  patchContentSeries as requestPatchContentSeries,
  patchSeriesEpisodeIdea as requestPatchSeriesEpisodeIdea,
  patchProductionAsset as requestPatchProductionAsset,
  scanTrends as requestTrendScan,
  saveProviderSecretToApi
} from "./lib/api.js";
import { loadStaffAgents, saveStaffAgents, type StaffAgent } from "./lib/agents.js";
import { evaluateCaseBudgetGuard } from "./lib/budget-guards.js";
import {
  buildAssetContextBrief,
  buildAssetContextBriefFromAssets,
  buildReferenceAssetPromptContext,
  findReadyReferenceAssetsByIds,
  getProductionAssetsForCase,
  getProductionAssetMediaUrl,
  isBackgroundDesignAsset,
  isCharacterDesignAsset,
  isReadyReferenceAsset,
  productionAssetToGenerationReference
} from "./lib/case-reference-assets.js";
import { createId } from "./lib/ids.js";
import { isRasterImageMediaUrl, resolveMediaUrl } from "./lib/media-url.js";
import {
  createCaseActivity,
  createSceneReviewItems,
  createJob,
  createProcessRecordsForJob,
  loadCaseActivities,
  loadCaseReferenceAssets,
  loadJobProcessRecords,
  loadJobs,
  loadSceneReviews,
  saveCaseActivities,
  saveJobProcessRecords,
  saveJobs,
  saveSceneReviews,
  syncProcessRecordsWithJob,
  syncRecordsWithAgents,
  type AdminJob,
  type CaseActivity,
  type CaseActivityType,
  type CaseReferenceAsset,
  type JobProcessRecord,
  type NewJobInput,
  type ProcessRecordStatus,
  type SceneReviewItem
} from "./lib/jobs.js";
import type { ProductionStageId } from "./lib/production.js";
import { buildProductionAssetVersionDraft } from "./lib/production-assets.js";
import { evaluateScheduleRunGuard } from "./lib/schedule-guards.js";
import { tryAcquireScheduleRunLock } from "./lib/schedule-run-locks.js";
import { buildDefaultBrief } from "./lib/topic-presets.js";
import { inferTemplateTypeFromGenre } from "./lib/genres.js";
import { countDirtyDrafts, updateDirtyDraftMap } from "./lib/editable-draft.js";
import { importLocalDataSnapshot, isLocalDataMigrationMessage } from "./lib/local-data-portability.js";
import { resolveViewFromHash, type ActiveView } from "./lib/view-routing.js";

type ApiState = "checking" | "online" | "offline";
type ServiceState = "checking" | "online" | "offline" | "warning";

export interface CaseDraftPreview {
  input: NewJobInput;
  result: GenerateScriptStoryResponse;
}

const libraryJobId = "asset_library";

function formatApiEnvironmentLabel(env: string | null | undefined): string {
  if (env === "production") return "生产环境";
  if (env === "development") return "开发环境";
  if (env === "test") return "测试环境";
  return env ? env : "在线";
}

function formatScheduleRunSource(mode: "manual" | "due"): string {
  return mode === "manual" ? "手动立即执行" : "到点自动执行";
}

const viewTitles: Record<ActiveView, { eyebrow: string; title: string }> = {
  dashboard: { eyebrow: "运营总览", title: "内容工厂控制台" },
  automation: { eyebrow: "自动排程", title: "自动化控制" },
  trends: { eyebrow: "市场信号", title: "趋势雷达" },
  series: { eyebrow: "系列内容库", title: "系列题库规划" },
  cases: { eyebrow: "生产案件", title: "影片 Case 历史" },
  assets: { eyebrow: "设计管理", title: "设计资产中心" },
  agents: { eyebrow: "主控 Agent", title: "AI 主控 Agent" },
  workflow: { eyebrow: "生产流程", title: "流程与工具端口" },
  keys: { eyebrow: "密钥管理", title: "供应商密钥" },
  youtube: { eyebrow: "发布管理", title: "YouTube 多账号" },
  storage: { eyebrow: "文件存储", title: "影片存放区" },
  cost: { eyebrow: "预算控制", title: "成本管理" }
};
function getInitialView(): ActiveView {
  const resolvedView = resolveViewFromHash(window.location.hash);

  if (resolvedView.canonicalHash) {
    window.history.replaceState(null, "", resolvedView.canonicalHash);
  }

  return resolvedView.view;
}

function buildGcsPath(settings: StorageSettings, job: AdminJob): string {
  const prefix = settings.gcsPrefix.replace(/^\/|\/$/g, "");
  return `gs://${settings.gcsBucket}/${prefix}/${job.id}.mp4`;
}

function createStoredVideoFromJob(job: AdminJob, settings: StorageSettings): StoredVideo {
  return {
    id: createId("video"),
    jobId: job.id,
    title: job.topic,
    durationSeconds: job.durationSeconds,
    resolution: "1080x1920",
    status: "ready_to_upload",
    storagePath: buildGcsPath(settings, job),
    costRM: job.actualCostRM,
    createdAt: new Date().toISOString()
  };
}

function createStoredVideoFromGeneration(job: AdminJob, result: GenerateVideoResponse): StoredVideo {
  return {
    id: createId("video"),
    jobId: job.id,
    title: result.script.title,
    durationSeconds: result.durationSeconds,
    resolution: "1080x1920",
    status: "ready_to_upload",
    publicUrl: result.artifacts.finalVideo.publicUrl,
    storagePath: result.artifacts.finalVideo.storagePath,
    costRM: result.costRM,
    createdAt: new Date().toISOString()
  };
}

function applyGenerationResultToRecords(records: JobProcessRecord[], jobId: string, result: GenerateVideoResponse, now: string, hasUploadTargets: boolean): JobProcessRecord[] {
  const artifactByStage: Partial<Record<ProductionStageId, { artifactPath: string; output: string; status: JobProcessRecord["status"] }>> = {
    archive: {
      artifactPath: result.artifacts.finalVideo.publicUrl ?? result.artifacts.finalVideo.storagePath,
      output: result.storage.fallbackReason ?? `已通过 ${result.storage.driver} 存储。`,
      status: "done"
    },
    compose: {
      artifactPath: result.artifacts.finalVideo.publicUrl ?? result.artifacts.finalVideo.storagePath,
      output: `已用审核后的场景画面和同步配音合成 ${result.durationSeconds.toFixed(1)}s 1080x1920 MP4。`,
      status: "done"
    },
    image: {
      artifactPath: result.artifacts.sceneImages.map((image) => image.publicUrl ?? image.storagePath).join("\n"),
      output: describeComposedSceneImages(result.artifacts.sceneImages),
      status: "done"
    },
    prompt: {
      artifactPath: result.artifacts.storyboard.publicUrl ?? result.artifacts.storyboard.storagePath,
      output: result.storyboard.map((scene) => `场景 ${scene.sceneId}: ${scene.imagePrompt}`).join("\n"),
      status: "done"
    },
    qc: {
      artifactPath: result.artifacts.finalVideo.publicUrl ?? result.artifacts.finalVideo.storagePath,
      output: "本地基础 QC 通过：最终 MP4 已创建并存储。",
      status: "done"
    },
    script: {
      artifactPath: result.artifacts.script.publicUrl ?? result.artifacts.script.storagePath,
      output: `${result.script.title}\n\n${result.script.voiceover}`,
      status: "done"
    },
    storyboard: {
      artifactPath: result.artifacts.storyboard.publicUrl ?? result.artifacts.storyboard.storagePath,
      output: result.storyboard.map((scene) => `场景 ${scene.sceneId} (${scene.durationSeconds.toFixed(1)}s): ${scene.visual}`).join("\n"),
      status: "done"
    },
    subtitle: {
      artifactPath: result.artifacts.subtitles.publicUrl ?? result.artifacts.subtitles.storagePath,
      output: "SRT 字幕已根据分镜旁白重新生成，并按配音音频时长重新校时。",
      status: "done"
    },
    tts: {
      artifactPath: [
        result.artifacts.voiceover.publicUrl ?? result.artifacts.voiceover.storagePath,
        result.artifacts.soundEffects.publicUrl ?? result.artifacts.soundEffects.storagePath
      ].join("\n"),
      output: "配音音频和音效 cue 清单已接入最终合成；影片和字幕时长会跟随这段音频同步。",
      status: "done"
    },
    video: {
      artifactPath: result.artifacts.sceneClips?.map((clip) => clip.publicUrl ?? clip.storagePath).join("\n") ?? "",
      output: result.artifacts.sceneClips?.length
        ? `已接入 ${result.artifacts.sceneClips.length} 个 Seedance 视频片段；最终 MP4 使用可用片段作为视觉轨，并由 FFmpeg 叠加同步配音与字幕。`
        : "没有可用的 Seedance 视频片段；最终 MP4 使用已审核场景图片作为视觉轨。",
      status: result.artifacts.sceneClips?.length ? "done" : "skipped"
    }
  };

  return records.map((record) => {
    if (record.jobId !== jobId) {
      return record;
    }

    const update = artifactByStage[record.stageId];

    if (!update) {
      return record.stageId === "publish"
        ? {
            ...record,
            output: hasUploadTargets
              ? "等待人工审核后再执行 YouTube 私密上传。"
              : "未配置 YouTube 目标；生产会停在 MP4/QC 完成状态，之后可再补充上传目标。",
            status: hasUploadTargets ? "pending" : "skipped",
            updatedAt: now
          }
        : record;
    }

    return {
      ...record,
      ...update,
      costRM: record.costRM,
      updatedAt: now
    };
  });
}

function applyVideoClipGenerationResultsToRecords(
  records: JobProcessRecord[],
  jobId: string,
  results: GenerateVideoClipResponse[],
  now: string,
  status: JobProcessRecord["status"] = "done",
  notes = ""
): JobProcessRecord[] {
  const clipArtifacts = results
    .map((result) => result.clip.asset.publicUrl ?? result.clip.asset.storagePath)
    .filter(Boolean);
  const totalCostRM = results.reduce((sum, result) => sum + result.costRM, 0);
  const totalDurationSeconds = results.reduce((sum, result) => sum + result.clip.durationSeconds, 0);
  const output = [
    results.length > 0
      ? `Seedance 2.0 已生成 ${results.length} 个场景视频片段，总时长 ${totalDurationSeconds}s。每个片段都按分镜场景时长和场景文本生成。`
      : "没有生成 Seedance 视频片段。",
    notes,
    "",
    ...results.flatMap((result) => [
      `场景 ${result.clip.sceneId}: ${result.clip.durationSeconds}s / ${result.clip.mode} / ${result.model}`,
      `任务: ${result.clip.taskId}`,
      result.fallbackReason ? `备注: ${result.fallbackReason}` : "",
      result.clip.prompt,
      ""
    ])
  ].filter(Boolean).join("\n");

  return records.map((record) => {
    if (record.jobId !== jobId || record.stageId !== "video") {
      return record;
    }

    return {
      ...record,
      artifactPath: clipArtifacts.join("\n"),
      costRM: Number(totalCostRM.toFixed(4)),
      notes,
      output,
      provider: results[0] ? `Seedance 2.0 ${results[0].model}` : record.provider,
      status,
      updatedAt: now
    };
  });
}

function describeComposedSceneImages(images: GenerateVideoResponse["artifacts"]["sceneImages"]): string {
  const paths = images.map((image) => image.publicUrl ?? image.storagePath);
  const rasterCount = paths.filter(isRasterImageArtifact).length;

  if (rasterCount > 0) {
    return `已接入 ${rasterCount} 张可审核场景图片，并用于 MP4 合成。批准前请在资产库检查缩略图。`;
  }

  return `已接入 ${images.length} 个非图片格式的场景资产。请先执行「生成图片」，建立可审核的 OpenAI PNG/JPG 场景图后再批准。`;
}

function isRasterImageArtifact(value: string | undefined): boolean {
  return isRasterImageMediaUrl(value);
}

function isAudioArtifact(value: string | undefined): boolean {
  return /\.(mp3|wav|m4a|aac|ogg|opus|flac)(\?|$)/iu.test(value ?? "");
}

function hasGeneratedRasterImages(records: JobProcessRecord[], jobId: string): boolean {
  const imageRecord = records.find((record) => record.jobId === jobId && record.stageId === "image");

  return Boolean(imageRecord?.status === "done" && imageRecord.artifactPath.split("\n").some((artifact) => isRasterImageArtifact(artifact.trim())));
}

function hasBlockedSceneReviews(sceneReviews: SceneReviewItem[], jobId: string): boolean {
  return sceneReviews.some((review) => review.jobId === jobId && (review.status === "needs_review" || review.status === "rejected" || review.qcStatus === "fail"));
}

function hasGeneratedVoiceoverAudio(records: JobProcessRecord[], jobId: string): boolean {
  const ttsRecord = records.find((record) => record.jobId === jobId && record.stageId === "tts");

  return Boolean(ttsRecord?.status === "done" && ttsRecord.artifactPath.split("\n").some((artifact) => isAudioArtifact(artifact.trim())));
}

function splitArtifactPaths(value: string | undefined): string[] {
  return (value ?? "")
    .split("\n")
    .map((artifact) => artifact.trim())
    .filter(Boolean);
}

function firstArtifactPath(value: string | undefined): string | undefined {
  return splitArtifactPaths(value)[0];
}

function collectQcArtifacts(records: JobProcessRecord[], jobId: string): {
  bgm?: string | undefined;
  finalVideo?: string | undefined;
  sceneImages: string[];
  subtitles?: string | undefined;
  voiceover?: string | undefined;
} {
  const imageRecord = records.find((record) => record.jobId === jobId && record.stageId === "image");
  const ttsRecord = records.find((record) => record.jobId === jobId && record.stageId === "tts");
  const bgmRecord = records.find((record) => record.jobId === jobId && record.stageId === "bgm");
  const subtitleRecord = records.find((record) => record.jobId === jobId && record.stageId === "subtitle");
  const composeRecord = records.find((record) => record.jobId === jobId && record.stageId === "compose");
  const ttsArtifacts = splitArtifactPaths(ttsRecord?.artifactPath);

  return {
    bgm: splitArtifactPaths(bgmRecord?.artifactPath).find(isAudioArtifact),
    finalVideo: firstArtifactPath(composeRecord?.artifactPath),
    sceneImages: splitArtifactPaths(imageRecord?.artifactPath).filter(isRasterImageArtifact),
    subtitles: firstArtifactPath(subtitleRecord?.artifactPath),
    voiceover: ttsArtifacts.find(isAudioArtifact)
  };
}

interface SeedanceSceneClipInput {
  durationSeconds: number;
  imageUrl?: string | undefined;
  lastFrameImageUrl?: string | undefined;
  prompt: string;
  referenceContext: string;
  referenceImageUrls: string[];
  sceneId: number;
}

interface StoryboardSceneTiming {
  durationSeconds: number;
  visual: string;
  voiceText: string;
}

function getSeedanceClipInputs(records: JobProcessRecord[], sceneReviews: SceneReviewItem[], referenceAssets: ProductionAsset[], job: AdminJob): SeedanceSceneClipInput[] {
  const imageRecord = records.find((record) => record.jobId === job.id && record.stageId === "image");
  const promptRecord = records.find((record) => record.jobId === job.id && record.stageId === "prompt");
  const sceneTimings = parseStoryboardSceneTimings(records, job.id);
  const scenePromptMap = parseScenePromptMap(promptRecord?.output ?? "");
  const jobReviews = sceneReviews.filter((review) => review.jobId === job.id).sort((left, right) => left.sceneId - right.sceneId);
  const imageArtifacts = splitArtifactPaths(imageRecord?.artifactPath).map(resolveMediaUrl).filter(isRasterImageArtifact);
  const enabledAssets = referenceAssets.filter((asset) => asset.jobId === job.id && (asset.status === "approved" || asset.status === "ready") && getProductionAssetMediaUrl(asset));
  const sceneIds = collectSceneIds(job, sceneTimings, jobReviews, imageArtifacts);

  return sceneIds.map((sceneId) => {
    const timing = sceneTimings.get(sceneId);
    const review = jobReviews.find((candidate) => candidate.sceneId === sceneId);
    const sceneImage = imageArtifacts.find((artifact) => getSceneNumberFromArtifact(artifact) === sceneId) ?? imageArtifacts[sceneId - 1];
    const firstFrameAsset = enabledAssets.find((asset) => asset.role === "first_frame" && asset.sceneId === sceneId) ?? enabledAssets.find((asset) => asset.role === "first_frame" && asset.sceneId === null);
    const lastFrameAsset = enabledAssets.find((asset) => asset.role === "last_frame" && asset.sceneId === sceneId) ?? enabledAssets.find((asset) => asset.role === "last_frame" && asset.sceneId === null);
    const firstFrameUrl = firstFrameAsset ? getProductionAssetMediaUrl(firstFrameAsset) : "";
    const lastFrameUrl = lastFrameAsset ? getProductionAssetMediaUrl(lastFrameAsset) : "";
    const imageUrl = firstFrameUrl || resolveMediaUrl(review?.artifactPath) || resolveMediaUrl(sceneImage) || undefined;
    const referenceAssetsForScene = enabledAssets
      .filter((asset) => asset.role === "reference_image" && (asset.sceneId === null || asset.sceneId === sceneId))
      .filter((asset, index, assets) => assets.findIndex((candidate) => getProductionAssetMediaUrl(candidate) === getProductionAssetMediaUrl(asset)) === index)
      .slice(0, 8);
    const referenceImageUrls = referenceAssetsForScene
      .map(getProductionAssetMediaUrl)
      .filter((url, index, urls) => Boolean(url) && url !== imageUrl && url !== lastFrameUrl && urls.indexOf(url) === index);
    const imagePrompt = scenePromptMap.get(sceneId) ?? review?.prompt ?? "";
    const durationSeconds = getSeedanceDurationSeconds(timing?.durationSeconds, job.durationSeconds, sceneIds.length);
    const referenceContext = referenceAssetsForScene
      .map(buildReferenceAssetPromptContext)
      .filter(Boolean)
      .join("\n");

    return {
      durationSeconds,
      imageUrl,
      lastFrameImageUrl: lastFrameUrl || undefined,
      prompt: buildSeedanceScenePrompt({
        durationSeconds,
        imagePrompt,
        referenceCount: referenceImageUrls.length,
        referenceContext,
        sceneId,
        visual: timing?.visual ?? review?.prompt ?? imagePrompt,
        voiceText: timing?.voiceText ?? ""
      }),
      referenceContext,
      referenceImageUrls,
      sceneId
    };
  });
}

function parseStoryboardSceneTimings(records: JobProcessRecord[], jobId: string): Map<number, StoryboardSceneTiming> {
  const storyboardRecord = records.find((record) => record.jobId === jobId && record.stageId === "storyboard");
  const output = storyboardRecord?.output ?? "";
  const scenePattern = /Scene\s+(\d+)\s*\(([\d.]+)s\):\s*([\s\S]*?)(?:\nVoice:\s*([\s\S]*?))?(?=\n\nScene\s+\d+\s*\(|$)/gu;
  const timings = new Map<number, StoryboardSceneTiming>();
  let match: RegExpExecArray | null;

  while ((match = scenePattern.exec(output)) !== null) {
    const sceneId = Number(match[1]);
    const durationSeconds = Number(match[2]);

    if (!Number.isFinite(sceneId) || sceneId < 1) {
      continue;
    }

    timings.set(sceneId, {
      durationSeconds: Number.isFinite(durationSeconds) && durationSeconds > 0 ? durationSeconds : 5,
      visual: (match[3] ?? "").trim(),
      voiceText: (match[4] ?? "").trim()
    });
  }

  return timings;
}

function parseScenePromptMap(output: string): Map<number, string> {
  const promptMap = new Map<number, string>();
  const scenePattern = /Scene\s+(\d+):\s*([\s\S]*?)(?=\nScene\s+\d+:|$)/gu;
  let match: RegExpExecArray | null;

  while ((match = scenePattern.exec(output)) !== null) {
    const sceneId = Number(match[1]);

    if (Number.isFinite(sceneId) && sceneId > 0) {
      promptMap.set(sceneId, (match[2] ?? "").trim());
    }
  }

  return promptMap;
}

function collectSceneIds(job: AdminJob, sceneTimings: Map<number, StoryboardSceneTiming>, sceneReviews: SceneReviewItem[], imageArtifacts: string[]): number[] {
  const sceneIds = new Set<number>();

  for (const sceneId of sceneTimings.keys()) {
    sceneIds.add(sceneId);
  }

  for (const review of sceneReviews) {
    sceneIds.add(review.sceneId);
  }

  for (const artifact of imageArtifacts) {
    const sceneId = getSceneNumberFromArtifact(artifact);

    if (sceneId !== Number.MAX_SAFE_INTEGER) {
      sceneIds.add(sceneId);
    }
  }

  if (sceneIds.size === 0) {
    for (let index = 1; index <= job.sceneCount; index += 1) {
      sceneIds.add(index);
    }
  }

  return [...sceneIds].sort((left, right) => left - right);
}

function getSeedanceDurationSeconds(sceneDurationSeconds: number | undefined, jobDurationSeconds: number, sceneCount: number): number {
  const fallbackDuration = jobDurationSeconds / Math.max(1, sceneCount);
  const rawDuration = Number.isFinite(sceneDurationSeconds ?? NaN) && (sceneDurationSeconds ?? 0) > 0 ? sceneDurationSeconds! : fallbackDuration;

  return Math.max(4, Math.min(15, Math.round(rawDuration)));
}

function buildSeedanceScenePrompt(input: {
  durationSeconds: number;
  imagePrompt: string;
  referenceCount: number;
  referenceContext: string;
  sceneId: number;
  visual: string;
  voiceText: string;
}): string {
  return [
    `Scene ${input.sceneId} motion clip. Target duration: ${input.durationSeconds}s.`,
    input.visual ? `Visible action: ${input.visual}` : "",
    input.voiceText ? `Narration/subtitle line for timing: ${input.voiceText}` : "",
    input.imagePrompt ? `Scene image prompt: ${input.imagePrompt}` : "",
    input.referenceCount > 0 ? `Use ${input.referenceCount} reference image(s) for character, setting, or style continuity. Preserve identity, wardrobe, lighting, and scene layout from references.` : "",
    input.referenceContext ? `Approved reference context:\n${input.referenceContext}` : "",
    "Create one continuous vertical 9:16 cinematic shot with natural subject motion and smooth camera movement.",
    "Do not add subtitles, captions, UI panels, storyboards, tables, logos, watermarks, or readable text inside the video. Final FFmpeg composition will add voiceover and subtitles."
  ].filter(Boolean).join("\n\n");
}

function replaceSceneArtifact(artifacts: string[], sceneId: number, artifactPath: string): string[] {
  const scenePattern = new RegExp(`scene_${String(sceneId).padStart(2, "0")}\\.`, "iu");
  const nextArtifacts = [...artifacts];
  const existingIndex = nextArtifacts.findIndex((artifact) => scenePattern.test(artifact));

  if (existingIndex >= 0) {
    nextArtifacts[existingIndex] = artifactPath;
    return nextArtifacts;
  }

  nextArtifacts.push(artifactPath);
  return nextArtifacts.sort((left, right) => getSceneNumberFromArtifact(left) - getSceneNumberFromArtifact(right));
}

function getSceneNumberFromArtifact(artifact: string): number {
  const match = artifact.match(/scene_(\d+)/iu);
  return match ? Number(match[1]) : Number.MAX_SAFE_INTEGER;
}

function parseScenePromptsFromOutput(output: string): Map<number, string> {
  const prompts = new Map<number, string>();

  output.split(/\n{2,}/u).forEach((block) => {
    const match = block.match(/^\s*Scene\s+(\d+):\s*([^\n]+)/iu);

    if (match?.[1] && match[2]) {
      prompts.set(Number(match[1]), match[2].trim());
    }
  });

  return prompts;
}

function buildMissingSceneReviewsFromRecords(records: JobProcessRecord[], existingReviews: SceneReviewItem[]): SceneReviewItem[] {
  const existingKeys = new Set(existingReviews.map((review) => `${review.jobId}:${review.sceneId}`));
  const missingReviews: SceneReviewItem[] = [];

  records
    .filter((record) => record.stageId === "image" && record.status === "done")
    .forEach((record) => {
      const prompts = parseScenePromptsFromOutput(record.output);
      splitArtifactPaths(record.artifactPath)
        .filter(isRasterImageArtifact)
        .forEach((artifact, index) => {
          const sceneId = getSceneNumberFromArtifact(artifact) === Number.MAX_SAFE_INTEGER ? index + 1 : getSceneNumberFromArtifact(artifact);
          const reviewKey = `${record.jobId}:${sceneId}`;

          if (existingKeys.has(reviewKey)) {
            return;
          }

          existingKeys.add(reviewKey);
          missingReviews.push({
            artifactPath: artifact,
            id: `${record.jobId}_scene_${sceneId}`,
            jobId: record.jobId,
            notes: "",
            prompt: prompts.get(sceneId) ?? `Scene ${sceneId} generated image`,
            qcIssues: [],
            qcStatus: "not_checked",
            qcSummary: "",
            referenceImagePath: "",
            sceneId,
            status: "generated",
            updatedAt: record.updatedAt
          });
        });
    });

  return missingReviews;
}

function hasGeneratedScriptStory(records: JobProcessRecord[], jobId: string): boolean {
  const scriptRecord = records.find((record) => record.jobId === jobId && record.stageId === "script");
  const storyboardRecord = records.find((record) => record.jobId === jobId && record.stageId === "storyboard");
  const promptRecord = records.find((record) => record.jobId === jobId && record.stageId === "prompt");

  return Boolean(scriptRecord?.status === "done" && storyboardRecord?.status === "done" && promptRecord?.status === "done");
}

function resetDownstreamRecordsAfterScriptOverwrite(records: JobProcessRecord[], jobId: string, now: string): JobProcessRecord[] {
  const downstreamStages: ProductionStageId[] = ["image", "video", "tts", "bgm", "subtitle", "compose", "qc", "publish", "archive"];

  return records.map((record) => {
    if (record.jobId !== jobId || !downstreamStages.includes(record.stageId)) {
      return record;
    }

    return {
      ...record,
      artifactPath: "",
      costRM: 0,
      notes: "脚本 / 分镜已被覆盖，下游产物需要重新生成。",
      output: "等待根据新的已确认脚本和分镜重新生成。",
      status: record.status === "skipped" ? "skipped" : "pending",
      updatedAt: now
    };
  });
}

function enrichProductionBriefWithReferenceAssets(productionBrief: ProductionBrief | null, referenceAssets: ProductionAsset[]): ProductionBrief | null {
  if (!productionBrief || referenceAssets.length === 0) {
    return productionBrief;
  }

  const characterAssets = referenceAssets.filter(isCharacterDesignAsset);
  const sceneAssets = referenceAssets.filter(isBackgroundDesignAsset);
  const referenceContinuityRules = [
    ...characterAssets.map((asset) => `${asset.label}: preserve character identity, silhouette, wardrobe, palette, and fixed props from the approved design asset.`),
    ...sceneAssets.map((asset) => `${asset.label}: preserve environment layout, key props, color palette, lighting direction, and reusable camera zones from the approved design asset.`)
  ];

  return {
    ...productionBrief,
    selectedCharacters: characterAssets.length > 0
      ? characterAssets.map((asset) => ({
        assetId: asset._id,
        label: asset.label,
        notes: buildReferenceAssetPromptContext(asset),
        role: asset.type,
        url: getProductionAssetMediaUrl(asset),
        visualIdentity: asset.prompt || asset.notes || asset.label
      }))
      : productionBrief.selectedCharacters,
    selectedScenes: sceneAssets.length > 0
      ? sceneAssets.map((asset) => ({
        assetId: asset._id,
        label: asset.label,
        location: asset.folderName,
        notes: buildReferenceAssetPromptContext(asset),
        url: getProductionAssetMediaUrl(asset),
        visualRules: asset.prompt || asset.notes || asset.label
      }))
      : productionBrief.selectedScenes,
    visualContinuityRules: [
      ...(productionBrief.visualContinuityRules ?? []),
      ...referenceContinuityRules
    ].filter((value, index, values) => Boolean(value && value.trim()) && values.indexOf(value) === index)
  };
}

function extractVoiceoverTextFromRecords(records: JobProcessRecord[], jobId: string): string {
  const storyboardRecord = records.find((record) => record.jobId === jobId && record.stageId === "storyboard");
  const storyboardVoiceText = storyboardRecord?.output
    .split("\n")
    .map((line) => line.match(/^\s*Voice:\s*(.+)$/u)?.[1]?.trim() ?? "")
    .filter(Boolean)
    .join("\n");

  if (storyboardVoiceText) {
    return storyboardVoiceText;
  }

  const scriptRecord = records.find((record) => record.jobId === jobId && record.stageId === "script");
  const output = scriptRecord?.output.trim() ?? "";

  if (!output) {
    return "";
  }

  const voiceoverMatch = output.match(/VOICEOVER:\s*([\s\S]+)$/u);

  if (voiceoverMatch?.[1]?.trim()) {
    return voiceoverMatch[1].trim();
  }

  const blocks = output.split(/\n{2,}/u).map((block) => block.trim()).filter(Boolean);
  return blocks.at(-1) ?? output;
}

function applyScriptStoryResultToRecords(
  records: JobProcessRecord[],
  jobId: string,
  result: GenerateScriptStoryResponse,
  now: string,
  options: { forceApproved?: boolean } = {}
): JobProcessRecord[] {
  const scriptUrl = result.artifacts.script.publicUrl ?? result.artifacts.script.storagePath;
  const storyboardUrl = result.artifacts.storyboard.publicUrl ?? result.artifacts.storyboard.storagePath;
  const visualBibleUrl = result.artifacts.visualBible.publicUrl ?? result.artifacts.visualBible.storagePath;
  const backgroundMusicOutput = formatBackgroundMusicBrief(result);
  const outlineNeedsReview = !options.forceApproved && (result.requiresReview || result.outlineQc.status !== "pass");
  const outlineNotes = outlineNeedsReview ? result.outlineQc.summary : "";
  const outlineStatus: ProcessRecordStatus = outlineNeedsReview ? "failed" : "done";

  return records.map((record) => {
    if (record.jobId !== jobId) {
      return record;
    }

    if (record.stageId === "script") {
      return {
        ...record,
        artifactPath: scriptUrl,
        costRM: result.costRM,
        notes: outlineNotes,
        output: [
          "AI INTERPRETED IDEA",
          formatInterpretedIdea(result.interpretedIdea),
          "",
          "OUTLINE QC",
          formatOutlineQc(result.outlineQc),
          "",
          result.script.title,
          "",
          "HOOK:",
          result.script.hook,
          "",
          "VOICEOVER:",
          result.script.voiceover
        ].join("\n"),
        provider: result.provider === "openai" ? `OpenAI ${result.model}` : result.model,
        status: outlineStatus,
        updatedAt: now
      };
    }

    if (record.stageId === "storyboard") {
      return {
        ...record,
        artifactPath: storyboardUrl,
        notes: outlineNotes,
        output: result.storyboard.map((scene) => `Scene ${scene.sceneId} (${scene.durationSeconds}s): ${scene.visual}\nVoice: ${scene.voiceText}`).join("\n\n"),
        provider: result.provider === "openai" ? `OpenAI ${result.model}` : result.model,
        status: outlineStatus,
        updatedAt: now
      };
    }

    if (record.stageId === "prompt") {
      return {
        ...record,
        artifactPath: [storyboardUrl, visualBibleUrl].filter(Boolean).join("\n"),
        notes: outlineNotes,
        output: [
          "VISUAL BIBLE",
          formatVisualBible(result.visualBible),
          "",
          "SCENE IMAGE PROMPTS",
          result.storyboard.map((scene) => `Scene ${scene.sceneId}: ${scene.imagePrompt}`).join("\n")
        ].join("\n"),
        provider: result.provider === "openai" ? `OpenAI ${result.model}` : result.model,
        status: outlineStatus,
        updatedAt: now
      };
    }

    if (record.stageId === "bgm") {
      return {
        ...record,
        input: `根据已确认的大纲生成可选背景音乐：\n${backgroundMusicOutput}`,
        output: backgroundMusicOutput,
        status: "pending",
        updatedAt: now
      };
    }

    return record;
  });
}

function formatBackgroundMusicBrief(result: GenerateScriptStoryResponse): string {
  const backgroundMusic = result.backgroundMusic ?? {
    enabled: true,
    instrumentation: "minimal cinematic pads, soft pulses, subtle percussion",
    mood: "cinematic, restrained, narration-friendly",
    prompt: `为《${result.script.title}》生成无歌词背景音乐。不要使用版权旋律，给旁白留出空间。`,
    style: "cinematic underscore",
    tempo: "slow to medium"
  };

  return [
    `Enabled: ${backgroundMusic.enabled ? "yes" : "no"}`,
    `Style: ${backgroundMusic.style}`,
    `Tempo: ${backgroundMusic.tempo}`,
    `Mood: ${backgroundMusic.mood}`,
    `Instrumentation: ${backgroundMusic.instrumentation}`,
    `Prompt: ${backgroundMusic.prompt}`
  ].join("\n");
}

function formatVisualBible(visualBible: GenerateScriptStoryResponse["visualBible"]): string {
  return [
    `Character: ${visualBible.character.name} / ${visualBible.character.role}`,
    `Age/body: ${visualBible.character.ageRange}; ${visualBible.character.bodyType}`,
    `Hair: ${visualBible.character.hair}`,
    `Wardrobe: ${visualBible.character.wardrobe}`,
    `Signature: ${visualBible.character.signatureDetails}`,
    `Fixed props: ${visualBible.character.fixedProps.join(", ") || "none"}`,
    `Environment: ${visualBible.environment.location}`,
    `Lighting: ${visualBible.environment.lighting}`,
    `Palette: ${visualBible.environment.palette}`,
    `Key objects: ${visualBible.environment.keyObjects.join(", ") || "none"}`,
    `Recurring details: ${visualBible.environment.recurringDetails}`,
    `Style: ${visualBible.style}`,
    `Negative: ${visualBible.negativePrompt}`
  ].join("\n");
}

function formatInterpretedIdea(idea: GenerateScriptStoryResponse["interpretedIdea"]): string {
  return [
    `Raw: ${idea.rawTopic}`,
    `Expanded premise: ${idea.expandedPremise}`,
    `Genre: ${idea.genre}`,
    `Logline: ${idea.logline}`,
    `Protagonist: ${idea.protagonist}`,
    `Setting: ${idea.setting}`,
    `Central object: ${idea.centralObject}`,
    `Conflict: ${idea.conflict}`,
    `Rule / limit: ${idea.ruleOrConstraint}`,
    `Escalation: ${idea.escalation}`,
    `Twist: ${idea.twist}`,
    `Ending hook: ${idea.endingHook}`
  ].join("\n");
}

function formatOutlineQc(qc: GenerateScriptStoryResponse["outlineQc"]): string {
  return [
    `Status: ${qc.status}`,
    `Summary: ${qc.summary}`,
    ...qc.checks.map((check) => `- ${check.status}: ${check.label} - ${check.detail}`)
  ].join("\n");
}

function applyImageGenerationResultToRecords(records: JobProcessRecord[], jobId: string, result: GenerateImagesResponse, now: string): JobProcessRecord[] {
  const failedChecks = result.images.filter((image) => image.qualityCheck?.status === "fail");

  return records.map((record) => {
    if (record.jobId !== jobId || record.stageId !== "image") {
      return record;
    }

    return {
      ...record,
      artifactPath: result.images.map((image) => image.asset.publicUrl ?? image.asset.storagePath).join("\n"),
      costRM: result.costRM,
      notes: failedChecks.length > 0 ? `${failedChecks.length} 张场景图片未通过视觉 QC。请审核并重跑后再合成 MP4。` : "",
      output: result.images.map((image) => [
        `Scene ${image.sceneId}: ${image.prompt}`,
        image.qualityCheck ? `QC: ${image.qualityCheck.status} - ${image.qualityCheck.summary}` : "QC: not checked",
        image.qualityCheck?.issues.length ? `Issues: ${image.qualityCheck.issues.join("; ")}` : ""
      ].filter(Boolean).join("\n")).join("\n\n"),
      provider: result.provider === "openai" ? `OpenAI ${result.model}` : result.model,
      status: result.requiresReview ? "failed" : "done",
      updatedAt: now
    };
  });
}

interface SceneImageGenerationTarget {
  prompt: string;
  sceneId: number;
}

function getImageGenerationTargetsFromRecords(records: JobProcessRecord[], job: AdminJob): SceneImageGenerationTarget[] {
  const promptRecord = records.find((record) => record.jobId === job.id && record.stageId === "prompt");
  const promptMap = parseScenePromptMap(promptRecord?.output ?? "");
  const timings = parseStoryboardSceneTimings(records, job.id);
  const sceneIds = new Set<number>();

  for (const sceneId of timings.keys()) {
    sceneIds.add(sceneId);
  }

  for (const sceneId of promptMap.keys()) {
    sceneIds.add(sceneId);
  }

  if (sceneIds.size === 0) {
    for (let sceneId = 1; sceneId <= job.sceneCount; sceneId += 1) {
      sceneIds.add(sceneId);
    }
  }

  return [...sceneIds]
    .filter((sceneId) => Number.isFinite(sceneId) && sceneId > 0)
    .sort((left, right) => left - right)
    .map((sceneId) => {
      const timing = timings.get(sceneId);
      const prompt = [
        promptMap.get(sceneId),
        timing?.visual ? `Visible scene: ${timing.visual}` : "",
        timing?.voiceText ? `Voice/subtitle: ${timing.voiceText}` : ""
      ].filter(Boolean).join("\n");

      return {
        prompt: prompt || `Scene ${sceneId} for ${job.topic}`,
        sceneId
      };
    });
}

function replaceGeneratedImage(images: GeneratedImageAsset[], image: GeneratedImageAsset): GeneratedImageAsset[] {
  return [
    image,
    ...images.filter((candidate) => candidate.sceneId !== image.sceneId)
  ].sort((left, right) => left.sceneId - right.sceneId);
}

function applySceneImageProgressToRecords(
  records: JobProcessRecord[],
  jobId: string,
  images: GeneratedImageAsset[],
  totalScenes: number,
  provider: string,
  model: string,
  now: string,
  options: { errorMessage?: string | undefined; final?: boolean | undefined } = {}
): JobProcessRecord[] {
  const failedChecks = images.filter((image) => image.qualityCheck?.status === "fail");
  const errorMessage = options.errorMessage?.trim() ?? "";
  const generatedCount = images.length;
  const providerLabel = provider === "openai" ? `OpenAI ${model}` : model || provider || "image provider";
  const status: ProcessRecordStatus = errorMessage
    ? "failed"
    : options.final
      ? failedChecks.length > 0
        ? "failed"
        : "done"
      : "working";
  const notes = errorMessage
    ? buildReadableImageGenerationError(errorMessage, generatedCount, totalScenes)
    : failedChecks.length > 0
      ? `${failedChecks.length} 张场景图片未通过视觉 QC。请审核并重跑后再合成 MP4。`
      : "";
  const output = [
    options.final
      ? `逐场景图片生成完成：${generatedCount}/${totalScenes}。`
      : `逐场景图片生成中：${generatedCount}/${totalScenes}。`,
    "",
    ...images.map((image) => [
      `Scene ${image.sceneId}: ${image.prompt}`,
      image.qualityCheck ? `QC: ${image.qualityCheck.status} - ${image.qualityCheck.summary}` : "QC: not checked",
      image.qualityCheck?.issues.length ? `Issues: ${image.qualityCheck.issues.join("; ")}` : ""
    ].filter(Boolean).join("\n")),
    errorMessage ? `\n错误：${buildReadableImageGenerationError(errorMessage, generatedCount, totalScenes)}` : ""
  ].filter(Boolean).join("\n\n");

  return records.map((record) => {
    if (record.jobId !== jobId || record.stageId !== "image") {
      return record;
    }

    return {
      ...record,
      artifactPath: images.map((image) => image.asset.publicUrl ?? image.asset.storagePath).join("\n"),
      costRM: Number(images.reduce((sum, image) => sum + image.costRM, 0).toFixed(4)),
      notes,
      output,
      provider: providerLabel,
      status,
      updatedAt: now
    };
  });
}

function buildReadableImageGenerationError(message: string, generatedCount: number, totalScenes: number): string {
  const progress = totalScenes > 0 ? `已保留 ${generatedCount}/${totalScenes} 张已成功图片。` : "";

  if (/HTTP 504|Gateway Timeout/iu.test(message)) {
    return `图片供应商或反向代理等待超时。系统现在按单个场景生成，${progress} 请在「资产」页签对失败场景单独重试。原始错误：${message}`;
  }

  return [message, progress].filter(Boolean).join(" ");
}

function applyTtsGenerationResultToRecords(records: JobProcessRecord[], jobId: string, result: GenerateTtsResponse, now: string): JobProcessRecord[] {
  return records.map((record) => {
    if (record.jobId !== jobId) {
      return record;
    }

    if (record.stageId === "subtitle") {
      return {
        ...record,
        artifactPath: "",
        output: "等待合成阶段。字幕会使用与 TTS 相同的分镜旁白重新生成，并按配音音频校时。",
        status: "pending",
        updatedAt: now
      };
    }

    if (record.stageId === "compose" || record.stageId === "qc" || record.stageId === "archive") {
      return {
        ...record,
        artifactPath: "",
        output: "新的配音音频已生成，等待重新合成 MP4。",
        status: "pending",
        updatedAt: now
      };
    }

    if (record.stageId !== "tts") {
      return record;
    }

    return {
      ...record,
      artifactPath: result.audio.publicUrl ?? result.audio.storagePath,
      costRM: result.costRM,
      output: [
        `已使用 ${result.provider} ${result.model} / ${result.voice} 生成配音音频。格式：${result.format}。`,
        "旁白来源是分镜场景文本，字幕和画面节奏会使用同一份文本。",
        "",
        result.voiceoverText
      ].join("\n"),
      provider: `OpenAI ${result.model}`,
      status: "done",
      updatedAt: now
    };
  });
}

function applyBgmGenerationResultToRecords(records: JobProcessRecord[], jobId: string, result: GenerateBgmResponse, now: string): JobProcessRecord[] {
  return records.map((record) => {
    if (record.jobId !== jobId) {
      return record;
    }

    if (record.stageId === "compose" || record.stageId === "qc" || record.stageId === "archive") {
      return {
        ...record,
        artifactPath: "",
        output: "新的背景音乐已生成，等待重新合成 MP4。",
        status: "pending",
        updatedAt: now
      };
    }

    if (record.stageId !== "bgm") {
      return record;
    }

    return {
      ...record,
      artifactPath: result.audio.publicUrl ?? result.audio.storagePath,
      costRM: result.costRM,
      output: [
        `已使用 ${result.provider} ${result.model} 生成无歌词背景音乐。格式：${result.format}，时长：${result.durationSeconds}s。`,
        result.songId ? `Song ID: ${result.songId}` : "",
        "",
        result.prompt
      ].filter(Boolean).join("\n"),
      provider: `ElevenLabs ${result.model}`,
      status: "done",
      updatedAt: now
    };
  });
}

function formatQcReport(report: GenerateQcReportResponse): string {
  return [
    report.summary,
    report.durationSeconds ? `Duration: ${report.durationSeconds.toFixed(2)}s` : "",
    report.resolution ? `Resolution: ${report.resolution}` : "",
    "",
    ...report.checks.map((check) => `[${check.status.toUpperCase()}] ${check.label}: ${check.detail}`)
  ].filter(Boolean).join("\n");
}

function keepLaterStatus(currentStatus: JobStatus, generatedStatus: JobStatus): JobStatus {
  const order: Partial<Record<JobStatus, number>> = {
    IMAGE_DONE: 5,
    TTS_DONE: 7,
    BGM_DONE: 8,
    READY_TO_UPLOAD: 11,
    COMPOSED: 10,
    QC_PASSED: 11,
    UPLOADED_PRIVATE: 12,
    COMPLETED: 13
  };

  return (order[currentStatus] ?? 0) > (order[generatedStatus] ?? 0) ? currentStatus : generatedStatus;
}

function defaultProductionAssetRole(type: ProductionAssetType): ProductionAsset["role"] {
  if (type === "first_frame") return "first_frame";
  if (type === "last_frame") return "last_frame";
  if (type === "bgm_reference") return "bgm_reference";
  if (type === "character_design" || type === "scene_design" || type === "style_reference") return "reference_image";
  return "none";
}

export function App() {
  const [activeView, setActiveView] = useState<ActiveView>(() => getInitialView());
  const [dirtyDrafts, setDirtyDrafts] = useState<Record<string, boolean>>({});
  const dirtyDraftCount = useMemo(() => countDirtyDrafts(dirtyDrafts), [dirtyDrafts]);
  const hasUnsavedDrafts = dirtyDraftCount > 0;
  const activeViewRef = useRef(activeView);
  const hasUnsavedDraftsRef = useRef(hasUnsavedDrafts);
  const [apiState, setApiState] = useState<ApiState>("checking");
  const [databaseState, setDatabaseState] = useState<ServiceState>("checking");
  const [health, setHealth] = useState<HealthResponse | null>(null);
  const [databaseStatus, setDatabaseStatus] = useState<DatabaseStatusResponse | null>(null);
  const [staffAgents, setStaffAgentsState] = useState<StaffAgent[]>(() => loadStaffAgents());
  const [jobs, setJobs] = useState<AdminJob[]>(() => loadJobs());
  const [jobProcessRecords, setJobProcessRecords] = useState<JobProcessRecord[]>(() => loadJobProcessRecords(loadJobs(), loadStaffAgents()));
  const [caseActivities, setCaseActivities] = useState<CaseActivity[]>(() => loadCaseActivities(loadJobs()));
  const [selectedJobId, setSelectedJobId] = useState<string | null>(() => loadJobs()[0]?.id ?? null);
  const [aiToolEndpoints, setAiToolEndpoints] = useState<AiToolEndpoint[]>(() => loadAiToolEndpoints());
  const [toolProviderSettings, setToolProviderSettings] = useState<ToolProviderSettings[]>(() => loadToolProviderSettings());
  const [providerKeys, setProviderKeys] = useState<ProviderKeyRecord[]>(() => loadProviderKeys());
  const [secretDrafts, setSecretDrafts] = useState<Record<string, string>>({});
  const [visibleDrafts, setVisibleDrafts] = useState<Record<string, boolean>>({});
  const [accounts, setAccounts] = useState<YouTubeAccount[]>(() => loadYouTubeAccounts());
  const [publishingTargets, setPublishingTargets] = useState<PublishingTarget[]>(() => loadPublishingTargets(loadYouTubeAccounts()));
  const [casePublishTargets, setCasePublishTargets] = useState<CasePublishTarget[]>(() => loadCasePublishTargets(loadJobs().map((job) => job.id)));
  const [characterProfiles] = useState<CharacterProfile[]>(() => loadCharacterProfiles());
  const [selectedCharacterId, setSelectedCharacterId] = useState<string | null>(null);
  const [selectedCharacterAssetId, setSelectedCharacterAssetId] = useState<string | null>(null);
  const [selectedBackgroundAssetId, setSelectedBackgroundAssetId] = useState<string | null>(null);
  const [selectedCharacterAssetIds, setSelectedCharacterAssetIds] = useState<string[]>([]);
  const [selectedSceneAssetIds, setSelectedSceneAssetIds] = useState<string[]>([]);
  const [selectedCaseSeriesId, setSelectedCaseSeriesId] = useState<string>("");
  const [selectedCaseEpisodeId, setSelectedCaseEpisodeId] = useState<string>("");
  const [selectedCaseStoryWorldId, setSelectedCaseStoryWorldId] = useState<string>("");
  const [caseLessonOrTheme, setCaseLessonOrTheme] = useState("");
  const [caseGoal, setCaseGoal] = useState("");
  const [caseConflict, setCaseConflict] = useState("");
  const [caseTone, setCaseTone] = useState("");
  const [sceneReviews, setSceneReviews] = useState<SceneReviewItem[]>(() => loadSceneReviews(loadJobs()));
  const [caseReferenceAssets, setCaseReferenceAssets] = useState<CaseReferenceAsset[]>(() => loadCaseReferenceAssets(loadJobs()));
  const [productionAssets, setProductionAssets] = useState<ProductionAsset[]>([]);
  const [selectedProductionAssetId, setSelectedProductionAssetId] = useState<string | null>(null);
  const [assetFilterJobId, setAssetFilterJobId] = useState("");
  const [assetFilterStatus, setAssetFilterStatus] = useState<ProductionAssetStatus | "">("");
  const [isLoadingProductionAssets, setIsLoadingProductionAssets] = useState(false);
  const [assetError, setAssetError] = useState<string | null>(null);
  const [caseQcReports, setCaseQcReports] = useState<CaseQcReport[]>(() => loadCaseQcReports(loadJobs().map((job) => job.id)));
  const [productionSchedules, setProductionSchedules] = useState<ProductionSchedule[]>(() => loadProductionSchedules(loadPublishingTargets(loadYouTubeAccounts())));
  const [scheduleRuns, setScheduleRuns] = useState<ScheduleRun[]>(() => loadScheduleRuns(loadProductionSchedules(loadPublishingTargets(loadYouTubeAccounts()))));
  const [storageSettings, setStorageSettings] = useState<StorageSettings>(() => loadStorageSettings());
  const [storedVideos, setStoredVideos] = useState<StoredVideo[]>(() => loadStoredVideos());
  const [trendReports, setTrendReports] = useState<TrendReport[]>(() => loadTrendReports());
  const [budgetSettings, setBudgetSettings] = useState<BudgetSettings>(() => loadBudgetSettings());
  const [trendQuery, setTrendQuery] = useState("shorts story");
  const [trendRegionCode, setTrendRegionCode] = useState("MY");
  const [trendPublishedWithinDays, setTrendPublishedWithinDays] = useState(7);
  const [trendMaxResults, setTrendMaxResults] = useState(15);
  const [trendLanguage, setTrendLanguage] = useState<"zh-CN" | "en-US">("zh-CN");
  const [trendSafeMode, setTrendSafeMode] = useState<"standard" | "strict">("strict");
  const [trendLanguageMode, setTrendLanguageMode] = useState<"loose" | "strict">("strict");
  const [trendCategoryId, setTrendCategoryId] = useState("");
  const [trendIncludeKeywords, setTrendIncludeKeywords] = useState("");
  const [trendExcludeKeywords, setTrendExcludeKeywords] = useState("kids, child, baby, nsfw, sexy, gore, violence");
  const [trendMinViews, setTrendMinViews] = useState(0);
  const [trendMinVelocityScore, setTrendMinVelocityScore] = useState(0);
  const [isScanningTrends, setIsScanningTrends] = useState(false);
  const [trendScanError, setTrendScanError] = useState<string | null>(null);
  const [contentSeries, setContentSeries] = useState<ContentSeries[]>([]);
  const [seriesEpisodes, setSeriesEpisodes] = useState<SeriesEpisodeIdea[]>([]);
  const [storyWorlds, setStoryWorlds] = useState<StoryWorld[]>([]);
  const [selectedSeriesId, setSelectedSeriesId] = useState<string | null>(null);
  const [seriesError, setSeriesError] = useState<string | null>(null);
  const [isLoadingSeries, setIsLoadingSeries] = useState(false);
  const [generatingSeriesIdeaIds, setGeneratingSeriesIdeaIds] = useState<string[]>([]);
  const [caseDraftPreview, setCaseDraftPreview] = useState<CaseDraftPreview | null>(null);
  const [isGeneratingDraftPreview, setIsGeneratingDraftPreview] = useState(false);
  const [isAutoGeneratingCase, setIsAutoGeneratingCase] = useState(false);
  const [autoGenerateStep, setAutoGenerateStep] = useState<string | null>(null);
  const [generatingImageCaseIds, setGeneratingImageCaseIds] = useState<string[]>([]);
  const [generatingSceneImageIds, setGeneratingSceneImageIds] = useState<string[]>([]);
  const [generatingProductionAssetIds, setGeneratingProductionAssetIds] = useState<string[]>([]);
  const [generatingScriptCaseIds, setGeneratingScriptCaseIds] = useState<string[]>([]);
  const [generatingTtsCaseIds, setGeneratingTtsCaseIds] = useState<string[]>([]);
  const [generatingBgmCaseIds, setGeneratingBgmCaseIds] = useState<string[]>([]);
  const [generatingVideoClipCaseIds, setGeneratingVideoClipCaseIds] = useState<string[]>([]);
  const [generatingCaseIds, setGeneratingCaseIds] = useState<string[]>([]);
  const [generatingQcCaseIds, setGeneratingQcCaseIds] = useState<string[]>([]);
  const [generationError, setGenerationError] = useState<string | null>(null);
  const [topic, setTopic] = useState("");
  const [prompt, setPrompt] = useState("");
  const [genreText, setGenreText] = useState("");
  const [templateType, setTemplateType] = useState<AdminJob["templateType"]>("urban_legend");
  const [language, setLanguage] = useState<AdminJob["language"]>("zh-CN");
  const [sceneCount, setSceneCount] = useState(5);
  const [costLimitRM, setCostLimitRM] = useState(() => budgetSettings.defaultCaseBudgetRM);

  useEffect(() => {
    saveStaffAgents(staffAgents);
  }, [staffAgents]);

  useEffect(() => {
    saveJobs(jobs);
  }, [jobs]);

  useEffect(() => {
    saveJobProcessRecords(jobProcessRecords);
  }, [jobProcessRecords]);

  useEffect(() => {
    saveCaseActivities(caseActivities);
  }, [caseActivities]);

  useEffect(() => {
    saveAiToolEndpoints(aiToolEndpoints);
  }, [aiToolEndpoints]);

  useEffect(() => {
    saveToolProviderSettings(toolProviderSettings);
  }, [toolProviderSettings]);

  useEffect(() => {
    saveBudgetSettings(budgetSettings);
  }, [budgetSettings]);

  useEffect(() => {
    saveProviderKeys(providerKeys);
  }, [providerKeys]);

  function getToolOverride(toolType: ToolProviderType) {
    return buildToolProviderOverride(findToolProviderSettings(toolProviderSettings, toolType));
  }

  useEffect(() => {
    saveYouTubeAccounts(accounts);
  }, [accounts]);

  useEffect(() => {
    savePublishingTargets(publishingTargets);
  }, [publishingTargets]);

  useEffect(() => {
    saveCasePublishTargets(casePublishTargets);
  }, [casePublishTargets]);

  useEffect(() => {
    saveCharacterProfiles(characterProfiles);
  }, [characterProfiles]);

  useEffect(() => {
    saveSceneReviews(sceneReviews);
  }, [sceneReviews]);

  useEffect(() => {
    const missingReviews = buildMissingSceneReviewsFromRecords(jobProcessRecords, sceneReviews);

    if (missingReviews.length > 0) {
      setSceneReviews((currentReviews) => [...missingReviews, ...currentReviews]);
    }
  }, [jobProcessRecords, sceneReviews]);

  useEffect(() => {
    saveCaseQcReports(caseQcReports);
  }, [caseQcReports]);

  useEffect(() => {
    saveProductionSchedules(productionSchedules);
  }, [productionSchedules]);

  useEffect(() => {
    saveScheduleRuns(scheduleRuns);
  }, [scheduleRuns]);

  useEffect(() => {
    saveStorageSettings(storageSettings);
  }, [storageSettings]);

  useEffect(() => {
    saveStoredVideos(storedVideos);
  }, [storedVideos]);

  useEffect(() => {
    saveTrendReports(trendReports);
  }, [trendReports]);

  useEffect(() => {
    void refreshOperationalStatus();
    const timer = window.setInterval(() => void refreshOperationalStatus(), 30_000);

    return () => window.clearInterval(timer);
  }, []);

  useEffect(() => {
    void refreshProductionAssets();
  }, []);

  useEffect(() => {
    void refreshSeries();
  }, []);

  useEffect(() => {
    void refreshStoryWorlds();
  }, []);

  useEffect(() => {
    activeViewRef.current = activeView;
  }, [activeView]);

  useEffect(() => {
    hasUnsavedDraftsRef.current = hasUnsavedDrafts;
  }, [hasUnsavedDrafts]);

  useEffect(() => {
    if (!hasUnsavedDrafts) {
      return;
    }

    const handler = (event: BeforeUnloadEvent) => {
      event.preventDefault();
      event.returnValue = "";
    };

    window.addEventListener("beforeunload", handler);
    return () => window.removeEventListener("beforeunload", handler);
  }, [hasUnsavedDrafts]);

  useEffect(() => {
    const handler = (event: MessageEvent<unknown>) => {
      if (!isLocalDataMigrationMessage(event.data)) {
        return;
      }

      const recentlyImportedAt = Number(window.sessionStorage.getItem("ai-content-factory:last-local-data-import") ?? 0);

      if (Date.now() - recentlyImportedAt < 30_000) {
        return;
      }

      const snapshot = event.data.snapshot;
      const shouldImport = window.confirm(
        `检测到来自 ${snapshot.sourceOrigin} 的旧站资料迁移包，共 ${snapshot.entries.length} 项。\n\n导入会覆盖当前浏览器在 ${window.location.origin} 的本地业务资料，并刷新页面。是否继续？`
      );

      if (!shouldImport) {
        return;
      }

      const result = importLocalDataSnapshot(snapshot, { overwrite: true });
      window.sessionStorage.setItem("ai-content-factory:last-local-data-import", String(Date.now()));
      window.alert(`已导入 ${result.imported} 项资料，跳过 ${result.skipped} 项。页面将刷新。`);
      window.location.reload();
    };

    window.addEventListener("message", handler);
    return () => window.removeEventListener("message", handler);
  }, []);

  useEffect(() => {
    function onHashChange() {
      const nextView = getInitialView();
      const currentView = activeViewRef.current;

      if (nextView === currentView) {
        return;
      }

      if (hasUnsavedDraftsRef.current && !window.confirm("当前页面还有未保存修改。切换页面会放弃这些草稿，确定继续吗？")) {
        window.history.replaceState(null, "", `#${currentView}`);
        return;
      }

      activeViewRef.current = nextView;
      setActiveView(nextView);
    }

    window.addEventListener("hashchange", onHashChange);
    return () => window.removeEventListener("hashchange", onHashChange);
  }, []);

  useEffect(() => {
    runDueProductionSchedules();
    const timer = window.setInterval(runDueProductionSchedules, 60_000);

    return () => window.clearInterval(timer);
  }, [productionSchedules, publishingTargets, jobs, staffAgents, aiToolEndpoints, providerKeys, toolProviderSettings, budgetSettings]);

  async function refreshOperationalStatus() {
    await Promise.all([refreshHealth(), refreshDatabaseStatus(), refreshProviderSecretStatuses()]);
  }

  async function refreshHealth() {
    setApiState("checking");

    try {
      const response = await fetch(`${apiBaseUrl}/health`);

      if (!response.ok) {
        throw new Error(`Health check failed: ${response.status}`);
      }

      setHealth((await response.json()) as HealthResponse);
      setApiState("online");
      setGenerationError((currentError) => (currentError?.includes("API server is offline") ? null : currentError));
    } catch {
      setHealth(null);
      setApiState("offline");
    }
  }

  async function refreshDatabaseStatus() {
    setDatabaseState("checking");

    try {
      const response = await getDatabaseStatus();
      setDatabaseStatus(response);
      setDatabaseState(response.ok ? "online" : "offline");
    } catch {
      setDatabaseStatus(null);
      setDatabaseState("offline");
    }
  }

  async function refreshProviderSecretStatuses() {
    try {
      const response = await getProviderSecretStatuses();
      const statusesByName = new Map(response.keys.map((key) => [key.keyName, key]));

      setProviderKeys((currentKeys) =>
        currentKeys.map((key) => {
          const status = statusesByName.get(key.keyName);

          if (!status?.configured) {
            return key;
          }

          return {
            ...key,
            lastFour: status.lastFour ?? key.lastFour,
            status: "configured",
            updatedAt: key.updatedAt ?? response.timestamp
          };
        })
      );
    } catch {
      // The key page still works with local draft state when the API is offline.
    }
  }

  const reportDirtyDraft = useCallback((key: string, isDirty: boolean) => {
    setDirtyDrafts((currentDrafts) => updateDirtyDraftMap(currentDrafts, key, isDirty));
  }, []);

  useEffect(() => {
    const hasSecretDraft = Object.values(secretDrafts).some((value) => value.trim().length > 0);

    reportDirtyDraft("keys:secret-drafts", hasSecretDraft);
    return () => reportDirtyDraft("keys:secret-drafts", false);
  }, [reportDirtyDraft, secretDrafts]);

  function switchView(view: ActiveView) {
    if (view === activeView) {
      return;
    }

    if (hasUnsavedDrafts && !window.confirm("当前页面还有未保存修改。切换页面会放弃这些草稿，确定继续吗？")) {
      return;
    }

    activeViewRef.current = view;
    setActiveView(view);
    window.location.hash = view;
  }

  async function handleTrendScan() {
    if (isScanningTrends || !trendQuery.trim()) {
      return;
    }

    setIsScanningTrends(true);
    setTrendScanError(null);

    try {
      const response = await requestTrendScan({
        excludeKeywords: trendExcludeKeywords,
        includeKeywords: trendIncludeKeywords,
        language: trendLanguage,
        languageMode: trendLanguageMode,
        maxResults: trendMaxResults,
        minVelocityScore: trendMinVelocityScore,
        minViews: trendMinViews,
        publishedWithinDays: trendPublishedWithinDays,
        query: trendQuery.trim(),
        regionCode: trendRegionCode.trim() || "MY",
        safeMode: trendSafeMode,
        ...(trendCategoryId ? { categoryId: trendCategoryId } : {})
      });
      const report = createTrendReport(response);
      setTrendReports((currentReports) => [report, ...currentReports.filter((currentReport) => currentReport.id !== report.id)].slice(0, 20));
    } catch (error) {
      setTrendScanError(error instanceof Error ? error.message : "Trend scan failed.");
    } finally {
      setIsScanningTrends(false);
    }
  }

  function useTrendIdeaSeed(seed: TrendIdeaSeed) {
    const inferredTemplate = inferTemplateTypeFromGenre(seed.genre);
    const referenceVideos = seed.evidenceVideoIds
      .map((id) => trendReports[0]?.videos.find((video) => video.id === id))
      .filter((video): video is NonNullable<typeof video> => Boolean(video))
      .slice(0, 3);
    const referenceLines = referenceVideos.map((video, index) => `${index + 1}. ${video.title} / ${video.url}`);
    setTopic(seed.topic);
    setPrompt([
      seed.hook,
      "",
      seed.angle,
      seed.whyNow,
      referenceLines.length > 0 ? "Reference examples for pacing only. Do not copy titles, characters, scenes, or scripts:" : "",
      ...referenceLines,
      `Evidence video IDs: ${seed.evidenceVideoIds.join(", ")}`
    ].filter(Boolean).join("\n"));
    setGenreText(seed.genre);
    setTemplateType(inferredTemplate);
    setCaseDraftPreview(null);
    switchView("cases");
  }

  function applyAiNicheTrendPreset() {
    const isChineseScan = trendLanguage === "zh-CN";
    setTrendQuery(isChineseScan ? "AI工具 ChatGPT AI自动化 AI视频 生成式AI" : "AI tools ChatGPT AI automation AI video generative AI");
    setTrendCategoryId("");
    setTrendSafeMode("strict");
    setTrendLanguageMode("loose");
    setTrendIncludeKeywords(isChineseScan ? "AI, ChatGPT, OpenAI, 自动化, 工具, 生成式, AI视频" : "AI, ChatGPT, OpenAI, automation, tools, generative, AI video");
    setTrendExcludeKeywords("kids, child, baby, nsfw, sexy, gore, violence, prank, hot girl, fight, politics, crypto scam");
    setTrendMinViews(1_000);
    setTrendMinVelocityScore(0);
    setTrendPublishedWithinDays(7);
    setTrendMaxResults(15);
    setTrendScanError(null);
  }

  function setStaffAgents(updater: (agents: StaffAgent[]) => StaffAgent[]) {
    const nextAgents = updater(staffAgents);
    setStaffAgentsState(nextAgents);
    setJobProcessRecords((currentRecords) => syncRecordsWithAgents(currentRecords, nextAgents));
  }

  function getEnabledPublishingTargetIds(): string[] {
    return publishingTargets.filter((target) => target.enabled).map((target) => target.id);
  }

  function updateBudgetSettings(nextSettings: BudgetSettings) {
    const normalizedSettings = {
      ...nextSettings,
      updatedAt: new Date().toISOString()
    };

    setBudgetSettings(normalizedSettings);
    setCostLimitRM(normalizedSettings.defaultCaseBudgetRM);
    setProductionSchedules((currentSchedules) =>
      currentSchedules.map((schedule) => ({
        ...schedule,
        budgetLimitRM: normalizedSettings.dailyBudgetRM,
        maxCasesPerRun: normalizedSettings.maxCasesPerRun,
        maxVideosPerDay: normalizedSettings.maxVideosPerDay,
        nextRunAt: calculateNextRunAt({
          daysOfWeek: schedule.daysOfWeek,
          startTime: schedule.startTime
        })
      }))
    );
    setStaffAgents((currentAgents) =>
      currentAgents.map((agent, index) =>
        index === 0
          ? {
              ...agent,
              costGuardRM: normalizedSettings.defaultCaseBudgetRM,
              updatedAt: normalizedSettings.updatedAt
            }
          : agent
      )
    );
    setCaseDraftPreview(null);
  }

  function createDefaultPromptForTarget(target: PublishingTarget | undefined, runLabel: string): { prompt: string; topic: string } {
    const channel = target?.channelName ?? "Shorts Channel";
    const niche = target?.niche ?? target?.templateType ?? "general_shorts";
    const template = target?.templateType ?? "rules_horror";

    return {
      prompt: `自动排程生产一支45秒中文 Shorts。频道方向：${channel}。内容类型：${niche}。模板：${template}。要求：原创虚构内容、清楚分镜、生成到 MP4 后人工审核，再私密上传。`,
      topic: `${channel} 自动排程内容 ${runLabel}`
    };
  }

  function createCaseInputFromSchedule(schedule: ProductionSchedule, sequence: number, scheduleRunId: string): NewJobInput {
    const firstTarget = publishingTargets.find((target) => schedule.targetIds.includes(target.id)) ?? publishingTargets.find((target) => target.enabled);
    const brief = createDefaultPromptForTarget(firstTarget, `${new Date().toLocaleDateString()} #${sequence}`);

    return {
      costLimitRM: budgetSettings.defaultCaseBudgetRM,
      language: firstTarget?.language ?? "zh-CN",
      prompt: brief.prompt,
      sceneCount: 5,
      scheduleId: schedule.id,
      scheduleRunId,
      source: "scheduled",
      templateType: firstTarget?.templateType ?? "rules_horror",
      topic: brief.topic
    };
  }

  async function runProductionSchedule(scheduleId: string, mode: "manual" | "due" = "manual") {
    const schedule = productionSchedules.find((candidate) => candidate.id === scheduleId);
    const startedAt = new Date().toISOString();

    if (!schedule) {
      return;
    }

    const guard = evaluateScheduleRunGuard({
      endpoints: aiToolEndpoints,
      jobs,
      producerAgent: staffAgents[0] ?? null,
      providerKeys,
      publishingTargets,
      schedule,
      settings: toolProviderSettings,
      defaultCaseCostRM: budgetSettings.defaultCaseBudgetRM,
      stopWhenBudgetExceeded: budgetSettings.stopWhenBudgetExceeded
    });
    const { activeTargetIds, plannedCaseCount } = guard;

    if (!guard.canRun) {
      const reason = guard.blockers.join(" ");
      const now = new Date().toISOString();
      setScheduleRuns((currentRuns) => [createScheduleRun({ createdCaseIds: [], error: reason, finishedAt: now, plannedCaseCount: 0, scheduleId, startedAt, status: "blocked" }), ...currentRuns]);
      setProductionSchedules((currentSchedules) =>
        currentSchedules.map((currentSchedule) =>
          currentSchedule.id === scheduleId
            ? {
                ...currentSchedule,
                lastRunAt: now,
                nextRunAt: calculateNextRunAt(currentSchedule)
              }
            : currentSchedule
        )
      );
      return;
    }

    if (schedule.executionMode === "autopilot_to_mp4") {
      const run = createScheduleRun({
        createdCaseIds: [],
        plannedCaseCount,
        scheduleId,
        startedAt,
        status: "running"
      });
      const createdCaseIds: string[] = [];
      let runError: string | null = null;

      setScheduleRuns((currentRuns) => [run, ...currentRuns]);

      for (let index = 0; index < plannedCaseCount; index += 1) {
        const draftInput = createCaseInputFromSchedule(schedule, guard.todaysCaseCount + index + 1, run.id);

        try {
          const generatedJob = await runAutopilotPipelineFromInput(draftInput, activeTargetIds, [], {
            openCase: index === 0,
            sourceLabel: formatScheduleRunSource(mode)
          });
          createdCaseIds.push(generatedJob.id);
        } catch (error) {
          runError = error instanceof Error ? error.message : "Scheduled autopilot generation failed.";
          break;
        }
      }

      const finishedAt = new Date().toISOString();
      setScheduleRuns((currentRuns) =>
        currentRuns.map((currentRun) =>
          currentRun.id === run.id
            ? {
                ...currentRun,
                createdCaseIds,
                error: runError,
                finishedAt,
                status: runError ? "failed" : "completed"
              }
            : currentRun
        )
      );
      setProductionSchedules((currentSchedules) =>
        currentSchedules.map((currentSchedule) =>
          currentSchedule.id === scheduleId
            ? {
                ...currentSchedule,
                lastRunAt: finishedAt,
                nextRunAt: calculateNextRunAt(currentSchedule)
              }
            : currentSchedule
        )
      );
      return;
    }

    const queuedRun = createScheduleRun({
      createdCaseIds: [],
      plannedCaseCount,
      scheduleId,
      startedAt,
      status: "queued"
    });
    const createdJobs = Array.from({ length: plannedCaseCount }, (_unused, index) => createJob(createCaseInputFromSchedule(schedule, guard.todaysCaseCount + index + 1, queuedRun.id)));
    const newRecords = createdJobs.flatMap((job) => createProcessRecordsForJob(job, staffAgents, aiToolEndpoints));
    const newPublishTargets = createdJobs.flatMap((job) => createCasePublishTargets(job.id, activeTargetIds));
    const newActivities = createdJobs.map((job) =>
      createCaseActivity({
        detail:
          activeTargetIds.length > 0
            ? `${formatScheduleRunSource(mode)}已将这个 Case 排入生产，并绑定 ${activeTargetIds.length} 个私密上传目标。`
            : `${formatScheduleRunSource(mode)}已将这个 Case 排入生产；当前没有 YouTube 目标，会先停在 MP4/QC，之后可再绑定上传目标。`,
        jobId: job.id,
        title: "排程 Case 已建立",
        type: "schedule_run"
      })
    );
    const now = new Date().toISOString();

    setJobs((currentJobs) => [...createdJobs, ...currentJobs]);
    setJobProcessRecords((currentRecords) => [...newRecords, ...currentRecords]);
    setCasePublishTargets((currentTargets) => [...newPublishTargets, ...currentTargets]);
    setCaseActivities((currentActivities) => [...newActivities, ...currentActivities]);
    createdJobs.forEach((job) => void handleBootstrapProductionAssets(job));
    setScheduleRuns((currentRuns) => [
      {
        ...queuedRun,
        createdCaseIds: createdJobs.map((job) => job.id),
        finishedAt: now,
      },
      ...currentRuns
    ]);
    setProductionSchedules((currentSchedules) =>
      currentSchedules.map((currentSchedule) =>
        currentSchedule.id === scheduleId
          ? {
              ...currentSchedule,
              lastRunAt: now,
              nextRunAt: calculateNextRunAt(currentSchedule)
            }
          : currentSchedule
      )
    );
    setSelectedJobId(createdJobs[0]?.id ?? selectedJobId);
  }

  function runDueProductionSchedules() {
    const now = new Date();

    for (const schedule of productionSchedules) {
      if (schedule.enabled && new Date(schedule.nextRunAt) <= now) {
        if (!tryAcquireScheduleRunLock({ now, runAt: schedule.nextRunAt, scheduleId: schedule.id })) {
          continue;
        }

        void runProductionSchedule(schedule.id, "due");
      }
    }
  }

  function appendCaseActivity(jobId: string, type: CaseActivityType, title: string, detail: string, actor = staffAgents[0]?.name ?? "AI Producer Agent") {
    setCaseActivities((currentActivities) => [
      createCaseActivity({
        actor,
        detail,
        jobId,
        title,
        type
      }),
      ...currentActivities
    ]);
  }

  function blockIfCaseBudgetExceeded(job: AdminJob, operationLabel: string, estimatedCostRM?: number): boolean {
    const message = getCaseBudgetBlockMessage(job, operationLabel, estimatedCostRM);

    if (!message) {
      return false;
    }

    setGenerationError(message);
    appendCaseActivity(job.id, "error", `${operationLabel} blocked by budget`, message);
    return true;
  }

  function assertCaseBudgetAvailable(job: AdminJob, operationLabel: string, estimatedCostRM?: number): void {
    const message = getCaseBudgetBlockMessage(job, operationLabel, estimatedCostRM);

    if (!message) {
      return;
    }

    appendCaseActivity(job.id, "error", `${operationLabel} blocked by budget`, message);
    throw new Error(message);
  }

  function getCaseBudgetBlockMessage(job: AdminJob, operationLabel: string, estimatedCostRM?: number): string | null {
    if (!budgetSettings.stopWhenBudgetExceeded) {
      return null;
    }

    const guard = evaluateCaseBudgetGuard(job, { estimatedCostRM, operationLabel });
    return guard.canRun ? null : guard.message;
  }

  function upsertJob(job: AdminJob) {
    setJobs((currentJobs) => [job, ...currentJobs.filter((currentJob) => currentJob.id !== job.id)]);
  }

  function upsertJobRecords(jobId: string, records: JobProcessRecord[]) {
    setJobProcessRecords((currentRecords) => [...records, ...currentRecords.filter((record) => record.jobId !== jobId)]);
  }

  function addCaseActivities(activities: CaseActivity[]) {
    setCaseActivities((currentActivities) => [...activities, ...currentActivities]);
  }

  function getSelectedDraftAssets(): { assets: ProductionAsset[]; background: ProductionAsset | null; character: ProductionAsset | null } {
    const characterIds = selectedCharacterAssetIds.length > 0 ? selectedCharacterAssetIds : [selectedCharacterAssetId].filter((id): id is string => Boolean(id));
    const sceneIds = selectedSceneAssetIds.length > 0 ? selectedSceneAssetIds : [selectedBackgroundAssetId].filter((id): id is string => Boolean(id));
    const characters = characterIds
      .map((id) => productionAssets.find((asset) => asset._id === id && isReadyReferenceAsset(asset) && isCharacterDesignAsset(asset)) ?? null)
      .filter((asset): asset is ProductionAsset => Boolean(asset));
    const backgrounds = sceneIds
      .map((id) => productionAssets.find((asset) => asset._id === id && isReadyReferenceAsset(asset) && isBackgroundDesignAsset(asset)) ?? null)
      .filter((asset): asset is ProductionAsset => Boolean(asset));
    const character = characters[0] ?? null;
    const background = backgrounds[0] ?? null;

    return {
      assets: [...characters, ...backgrounds].filter((asset, index, assets) => assets.findIndex((candidate) => candidate._id === asset._id) === index),
      background,
      character
    };
  }

  function splitReadyReferenceAssetIdsByType(assetIds: string[], assetSource = productionAssets): { characterAssetIds: string[]; sceneAssetIds: string[] } {
    const assets = findReadyReferenceAssetsByIds(assetSource, assetIds);

    return {
      characterAssetIds: assets.filter(isCharacterDesignAsset).map((asset) => asset._id),
      sceneAssetIds: assets.filter(isBackgroundDesignAsset).map((asset) => asset._id)
    };
  }

  function mergeIds(...groups: string[][]): string[] {
    return groups.flat().filter((id, index, ids) => Boolean(id) && ids.indexOf(id) === index);
  }

  function buildProductionBriefFromDraft(referenceAssets = getSelectedDraftAssets()): ProductionBrief {
    const selectedSeries = selectedCaseSeriesId ? contentSeries.find((series) => series._id === selectedCaseSeriesId) ?? null : null;
    const selectedEpisode = selectedCaseEpisodeId ? seriesEpisodes.find((episode) => episode._id === selectedCaseEpisodeId) ?? null : null;
    const inheritedStoryWorldId = selectedCaseStoryWorldId || selectedSeries?.storyWorldId || "";
    const selectedStoryWorld = inheritedStoryWorldId ? storyWorlds.find((storyWorld) => storyWorld._id === inheritedStoryWorldId) ?? null : null;
    const characterAssets = referenceAssets.assets.filter(isCharacterDesignAsset);
    const sceneAssets = referenceAssets.assets.filter(isBackgroundDesignAsset);

    return {
      conflict: caseConflict.trim() || undefined,
      episodeContext: selectedEpisode ? {
        continuityNote: selectedEpisode.continuityNote,
        episodeId: selectedEpisode._id,
        episodeNo: selectedEpisode.episodeNo,
        interactiveEnding: selectedEpisode.interactiveEnding,
        lessonOrTheme: selectedEpisode.lessonOrTheme || selectedEpisode.moralLesson,
        promptSeed: selectedEpisode.promptSeed,
        serialHook: selectedEpisode.serialHook,
        synopsis: selectedEpisode.synopsis,
        title: selectedEpisode.title
      } : undefined,
      goal: caseGoal.trim() || undefined,
      lessonOrTheme: caseLessonOrTheme.trim() || selectedEpisode?.lessonOrTheme || selectedEpisode?.moralLesson || undefined,
      requiredBeats: [
        selectedEpisode?.synopsis,
        selectedEpisode?.promptSeed,
        selectedEpisode?.continuityNote,
        selectedEpisode?.serialHook,
        selectedEpisode?.interactiveEnding,
        selectedSeries?.continuityRules,
        caseGoal.trim(),
        caseConflict.trim()
      ].filter((value): value is string => Boolean(value && value.trim())),
      selectedCharacters: characterAssets.map((asset) => ({
        assetId: asset._id,
        label: asset.label,
        notes: buildReferenceAssetPromptContext(asset),
        role: asset.type,
        url: getProductionAssetMediaUrl(asset),
        visualIdentity: asset.prompt || asset.notes || asset.label
      })),
      selectedScenes: sceneAssets.map((asset) => ({
        assetId: asset._id,
        label: asset.label,
        location: asset.folderName,
        notes: buildReferenceAssetPromptContext(asset),
        url: getProductionAssetMediaUrl(asset),
        visualRules: asset.prompt || asset.notes || asset.label
      })),
      seriesContext: selectedSeries ? {
        audience: selectedSeries.audience,
        continuityRules: selectedSeries.continuityRules,
        contentType: selectedSeries.contentType,
        description: selectedSeries.description,
        dramaIntensity: selectedSeries.dramaIntensity,
        musicStyle: selectedSeries.musicStyle,
        name: selectedSeries.name,
        narrativeMode: selectedSeries.narrativeMode,
        safetyRules: selectedSeries.safetyRules,
        seriesId: selectedSeries._id,
        tone: selectedSeries.tone,
        values: selectedSeries.values,
        visualStyle: selectedSeries.visualStyle
      } : undefined,
      storyWorldContext: selectedStoryWorld ? {
        description: selectedStoryWorld.description,
        name: selectedStoryWorld.name,
        relationshipMap: selectedStoryWorld.relationshipMap,
        safetyRules: selectedStoryWorld.safetyRules,
        storyWorldId: selectedStoryWorld._id,
        visualStyle: selectedStoryWorld.visualStyle
      } : undefined,
      tone: caseTone.trim() || selectedSeries?.tone || undefined,
      visualContinuityRules: [
        selectedSeries?.visualStyle,
        selectedStoryWorld?.visualStyle,
        ...sceneAssets.map((asset) => `${asset.label}: preserve environment bible layout, props, lighting, and reusable camera zones.`),
        ...characterAssets.map((asset) => `${asset.label}: preserve character identity, silhouette, wardrobe, and fixed props.`)
      ].filter((value): value is string => Boolean(value && value.trim()))
    };
  }

  function getEffectivePrompt(topicValue = topic, promptValue = prompt, genreValue = genreText, referenceAssets = getSelectedDraftAssets()): string {
    const normalizedTopic = topicValue.trim();
    const manualPrompt = promptValue.trim();
    const normalizedGenre = genreValue.trim();
    const routedTemplateType = inferTemplateTypeFromGenre(normalizedGenre || normalizedTopic);
    const baseBrief = manualPrompt || buildDefaultBrief({
      genre: normalizedGenre || undefined,
      language,
      sceneCount,
      templateType: routedTemplateType,
      topic: normalizedTopic || "short-form story idea"
    });
    const assetContext = buildAssetContextBriefFromAssets(referenceAssets.assets) || buildAssetContextBrief(referenceAssets.character, referenceAssets.background);
    const productionBrief = buildProductionBriefFromDraft(referenceAssets);
    const structuredContext = [
      productionBrief.seriesContext?.narrativeMode ? `Narrative mode: ${productionBrief.seriesContext.narrativeMode}` : "",
      productionBrief.seriesContext?.dramaIntensity ? `Drama intensity: ${productionBrief.seriesContext.dramaIntensity}` : "",
      productionBrief.seriesContext?.continuityRules ? `Continuity rules: ${productionBrief.seriesContext.continuityRules}` : "",
      productionBrief.episodeContext?.continuityNote ? `Episode continuity: ${productionBrief.episodeContext.continuityNote}` : "",
      productionBrief.episodeContext?.serialHook ? `Episode serial hook: ${productionBrief.episodeContext.serialHook}` : "",
      productionBrief.seriesContext ? `系列上下文：${productionBrief.seriesContext.name} / ${productionBrief.seriesContext.description} / ${productionBrief.seriesContext.values}` : "",
      productionBrief.episodeContext ? `单集上下文：${productionBrief.episodeContext.title} / ${productionBrief.episodeContext.lessonOrTheme} / ${productionBrief.episodeContext.synopsis}` : "",
      productionBrief.storyWorldContext ? `世界观：${productionBrief.storyWorldContext.name} / ${productionBrief.storyWorldContext.description} / ${productionBrief.storyWorldContext.relationshipMap}` : "",
      productionBrief.lessonOrTheme ? `本集主题：${productionBrief.lessonOrTheme}` : "",
      productionBrief.goal ? `本集目标：${productionBrief.goal}` : "",
      productionBrief.conflict ? `本集冲突：${productionBrief.conflict}` : ""
    ].filter(Boolean).join("\n");

    return [baseBrief, structuredContext, assetContext].filter(Boolean).join("\n\n");
  }

  function handleCreateCase() {
    const normalizedTopic = topic.trim();
    const normalizedGenre = genreText.trim();
    const routedTemplateType = inferTemplateTypeFromGenre(normalizedGenre || normalizedTopic);
    const selectedAssets = getSelectedDraftAssets();
    const normalizedPrompt = getEffectivePrompt(normalizedTopic, prompt, normalizedGenre, selectedAssets);
    const productionBrief = buildProductionBriefFromDraft(selectedAssets);
    const selectedSeries = selectedCaseSeriesId ? contentSeries.find((series) => series._id === selectedCaseSeriesId) ?? null : null;
    const selectedEpisode = selectedCaseEpisodeId ? seriesEpisodes.find((episode) => episode._id === selectedCaseEpisodeId) ?? null : null;
    const storyWorldId = selectedCaseStoryWorldId || selectedSeries?.storyWorldId || null;

    if (!normalizedTopic) {
      return;
    }

    const job = createJob({
      backgroundAssetId: selectedAssets.background?._id ?? null,
      characterAssetIds: selectedAssets.assets.filter(isCharacterDesignAsset).map((asset) => asset._id),
      characterAssetId: selectedAssets.character?._id ?? null,
      characterId: selectedCharacterId,
      episodeId: selectedEpisode?._id ?? null,
      genre: normalizedGenre || undefined,
      productionBrief,
      sceneAssetIds: selectedAssets.assets.filter(isBackgroundDesignAsset).map((asset) => asset._id),
      seriesId: selectedSeries?._id ?? null,
      storyWorldId,
      topic: normalizedTopic,
      prompt: normalizedPrompt,
      templateType: routedTemplateType,
      language,
      sceneCount,
      costLimitRM
    });

    setJobs((currentJobs) => [job, ...currentJobs]);
    setJobProcessRecords((currentRecords) => [...createProcessRecordsForJob(job, staffAgents, aiToolEndpoints), ...currentRecords]);
    setCasePublishTargets((currentTargets) => [...createCasePublishTargets(job.id, getEnabledPublishingTargetIds()), ...currentTargets]);
    appendCaseActivity(job.id, "case_created", "Case 已建立", "这个 Case 是手动建立的，尚未生成脚本大纲。");
    void handleBootstrapProductionAssets(job);
    void attachSelectedAssetsToCase(job, selectedAssets.assets);
    setSelectedJobId(job.id);
    setTopic("");
    setPrompt("");
    setSelectedCharacterAssetId(null);
    setSelectedBackgroundAssetId(null);
    setSelectedCharacterAssetIds([]);
    setSelectedSceneAssetIds([]);
    switchView("cases");
  }

  async function handleGenerateDraftScriptStory() {
    const normalizedTopic = topic.trim();
    const normalizedGenre = genreText.trim();
    const routedTemplateType = inferTemplateTypeFromGenre(normalizedGenre || normalizedTopic);
    const selectedAssets = getSelectedDraftAssets();
    const normalizedPrompt = getEffectivePrompt(normalizedTopic, prompt, normalizedGenre, selectedAssets);
    const productionBrief = buildProductionBriefFromDraft(selectedAssets);
    const selectedSeries = selectedCaseSeriesId ? contentSeries.find((series) => series._id === selectedCaseSeriesId) ?? null : null;
    const selectedEpisode = selectedCaseEpisodeId ? seriesEpisodes.find((episode) => episode._id === selectedCaseEpisodeId) ?? null : null;
    const storyWorldId = selectedCaseStoryWorldId || selectedSeries?.storyWorldId || null;

    if (!normalizedTopic || isGeneratingDraftPreview) {
      return;
    }

    const draftJobId = createId("job");
    const draftInput: NewJobInput = {
      id: draftJobId,
      backgroundAssetId: selectedAssets.background?._id ?? null,
      characterAssetIds: selectedAssets.assets.filter(isCharacterDesignAsset).map((asset) => asset._id),
      characterAssetId: selectedAssets.character?._id ?? null,
      characterId: selectedCharacterId,
      costLimitRM,
      episodeId: selectedEpisode?._id ?? null,
      genre: normalizedGenre || undefined,
      language,
      prompt: normalizedPrompt,
      productionBrief,
      sceneAssetIds: selectedAssets.assets.filter(isBackgroundDesignAsset).map((asset) => asset._id),
      sceneCount,
      seriesId: selectedSeries?._id ?? null,
      storyWorldId,
      templateType: routedTemplateType,
      topic: normalizedTopic
    };

    setGenerationError(null);
    setIsGeneratingDraftPreview(true);

    if (apiState !== "online") {
      setGenerationError(`API 服务当前为 ${apiState}。生成大纲需要连接 ${apiBaseUrl}。`);
      setIsGeneratingDraftPreview(false);
      return;
    }

    try {
      const result = await requestDraftScriptStoryGeneration(
        {
          costLimitRM: draftInput.costLimitRM,
          durationSeconds: 45,
          genre: draftInput.genre,
          jobId: draftJobId,
          language: draftInput.language,
          prompt: draftInput.prompt,
          productionBrief: draftInput.productionBrief ?? undefined,
          sceneCount: draftInput.sceneCount,
          templateType: draftInput.templateType,
          topic: draftInput.topic
        },
        getToolOverride("llm")
      );

      setCaseDraftPreview({
        input: draftInput,
        result
      });
      appendCaseActivity(
        draftJobId,
        "script_preview_generated",
        "大纲预览已生成",
        `${result.provider} ${result.model} 已返回 ${result.storyboard.length} 个分镜场景。`
      );
    } catch (error) {
      setGenerationError(error instanceof Error ? error.message : "Script preview generation failed.");
    } finally {
      setIsGeneratingDraftPreview(false);
    }
  }

  function handleConfirmDraftCase() {
    if (!caseDraftPreview) {
      handleCreateCase();
      return;
    }

    const now = new Date().toISOString();
    const job = {
      ...createJob(caseDraftPreview.input),
      actualCostRM: caseDraftPreview.result.costRM,
      interpretedIdea: caseDraftPreview.result.interpretedIdea,
      outlineQc: caseDraftPreview.result.outlineQc,
      reviewStatus: caseDraftPreview.result.requiresReview ? "needs_review" as const : "draft" as const,
      status: caseDraftPreview.result.status,
      updatedAt: now,
      visualBible: caseDraftPreview.result.visualBible
    };
    const records = applyScriptStoryResultToRecords(
      createProcessRecordsForJob(job, staffAgents, aiToolEndpoints),
      job.id,
      caseDraftPreview.result,
      now,
      { forceApproved: true }
    );

    setJobs((currentJobs) => [job, ...currentJobs.filter((currentJob) => currentJob.id !== job.id)]);
    setJobProcessRecords((currentRecords) => [...records, ...currentRecords.filter((record) => record.jobId !== job.id)]);
    setCasePublishTargets((currentTargets) => [...createCasePublishTargets(job.id, getEnabledPublishingTargetIds()), ...currentTargets.filter((target) => target.jobId !== job.id)]);
    appendCaseActivity(job.id, "script_preview_approved", "大纲已确认", "已确认标题、脚本、分镜和图片提示词，并转换为生产 Case。");
    appendCaseActivity(job.id, "case_created", "Case 已建立", "这个 Case 已进入生产，脚本、分镜和图片提示词已写入记录。");
    void handleBootstrapProductionAssets(job);
    void attachSelectedAssetsToCase(job, getReferenceAssetsFromIds(
      caseDraftPreview.input.characterAssetIds ?? [],
      caseDraftPreview.input.sceneAssetIds ?? [],
      caseDraftPreview.input.characterAssetId,
      caseDraftPreview.input.backgroundAssetId
    ));
    setSelectedJobId(job.id);
    setTopic("");
    setPrompt("");
    setSelectedCharacterAssetId(null);
    setSelectedBackgroundAssetId(null);
    setSelectedCharacterAssetIds([]);
    setSelectedSceneAssetIds([]);
    setCaseDraftPreview(null);
    setGenerationError(null);
    switchView("cases");
  }

  async function runAutopilotPipelineFromInput(
    draftInput: NewJobInput,
    activeTargetIds: string[],
    selectedAssets: ProductionAsset[],
    options: { openCase?: boolean | undefined; sourceLabel: string }
  ): Promise<AdminJob> {
    const pipelineInput = {
      ...draftInput,
      id: draftInput.id ?? createId("job")
    };
    let workingJob: AdminJob | null = null;
    let workingRecords: JobProcessRecord[] = [];

    try {
      setAutoGenerateStep(`${options.sourceLabel}: 生成脚本与分镜`);
      const scriptResult = await requestDraftScriptStoryGeneration(
        {
          costLimitRM: pipelineInput.costLimitRM,
          durationSeconds: pipelineInput.durationSeconds ?? 45,
          genre: pipelineInput.genre,
          jobId: pipelineInput.id,
          language: pipelineInput.language,
          prompt: pipelineInput.prompt,
          productionBrief: pipelineInput.productionBrief ?? undefined,
          sceneCount: pipelineInput.sceneCount,
          templateType: pipelineInput.templateType,
          topic: pipelineInput.topic
        },
        getToolOverride("llm")
      );
      const scriptNow = new Date().toISOString();

      workingJob = {
        ...createJob(pipelineInput),
        actualCostRM: scriptResult.costRM,
        interpretedIdea: scriptResult.interpretedIdea,
        outlineQc: scriptResult.outlineQc,
        reviewStatus: scriptResult.requiresReview ? "needs_review" : "draft",
        status: scriptResult.status,
        updatedAt: scriptNow,
        visualBible: scriptResult.visualBible
      };
      workingRecords = applyScriptStoryResultToRecords(createProcessRecordsForJob(workingJob, staffAgents, aiToolEndpoints), workingJob.id, scriptResult, scriptNow);
      upsertJob(workingJob);
      upsertJobRecords(workingJob.id, workingRecords);
      void handleBootstrapProductionAssets(workingJob);
      const attachedAssets = await attachSelectedAssetsToCase(workingJob, selectedAssets);
      setCasePublishTargets((currentTargets) => [...createCasePublishTargets(workingJob!.id, activeTargetIds), ...currentTargets.filter((target) => target.jobId !== workingJob!.id)]);
      addCaseActivities([
        createCaseActivity({
          detail: `${options.sourceLabel}已建立生产 Case，并启动自动生产流程。`,
          jobId: workingJob.id,
          title: "Case 已建立",
          type: "case_created"
        }),
        createCaseActivity({
          detail: `${scriptResult.provider} ${scriptResult.model} 已生成脚本、分镜和图片提示词。`,
          jobId: workingJob.id,
          title: "脚本与分镜已生成",
          type: "script_generated"
        })
      ]);
      setSelectedJobId(workingJob.id);
      if (options.openCase) {
        switchView("cases");
      }

      if (scriptResult.requiresReview) {
        throw new Error(`大纲质检需要人工确认后才能生成图片。${scriptResult.outlineQc.summary}`);
      }

      assertCaseBudgetAvailable(workingJob, "自动生成图片");
      setAutoGenerateStep(`${options.sourceLabel}: 生成场景图片`);
      workingJob = {
        ...workingJob,
        status: "IMAGE_GENERATING",
        updatedAt: new Date().toISOString()
      };
      upsertJob(workingJob);
      workingRecords = workingRecords.map((record) =>
        record.stageId === "image"
          ? {
              ...record,
              output: "自动生产正在生成可审核的场景图片...",
              status: "working",
              updatedAt: new Date().toISOString()
            }
          : record
      );
      upsertJobRecords(workingJob.id, workingRecords);
      const imageResult = await requestSequentialSceneImages(
        workingJob,
        workingJob.characterId ? characterProfiles.find((character) => character.id === workingJob?.characterId) ?? null : null,
        getGenerationReferencesForJob(workingJob, attachedAssets),
        getToolOverride("image"),
        workingRecords
      );
      const imageNow = new Date().toISOString();
      workingJob = {
        ...workingJob,
        actualCostRM: Number((workingJob.actualCostRM + imageResult.costRM).toFixed(4)),
        reviewStatus: imageResult.requiresReview ? "needs_review" : workingJob.reviewStatus,
        status: keepLaterStatus(workingJob.status, imageResult.status),
        updatedAt: imageNow
      };
      workingRecords = applyImageGenerationResultToRecords(workingRecords, workingJob.id, imageResult, imageNow);
      setSceneReviews((currentReviews) => [
        ...createSceneReviewItems(workingJob!.id, imageResult.images, currentReviews),
        ...currentReviews.filter((review) => review.jobId !== workingJob!.id)
      ]);
      upsertJob(workingJob);
      upsertJobRecords(workingJob.id, workingRecords);
      appendCaseActivity(workingJob.id, "stage_updated", "图片已生成", `${imageResult.provider} ${imageResult.model} 已生成 ${imageResult.images.length} 张场景图片。成本 RM ${imageResult.costRM.toFixed(4)}。`);

      if (imageResult.requiresReview) {
        throw new Error("图片视觉 QC 发现问题。请检查生成图，重跑失败场景后再继续配音和 MP4。");
      }

      assertCaseBudgetAvailable(workingJob, "自动生成配音");
      setAutoGenerateStep(`${options.sourceLabel}: 生成配音`);
      const voiceoverText = extractVoiceoverTextFromRecords(workingRecords, workingJob.id);

      if (!voiceoverText) {
        throw new Error("自动生产找不到分镜旁白文本，无法生成 TTS 配音。");
      }

      workingJob = {
        ...workingJob,
        status: "TTS_GENERATING",
        updatedAt: new Date().toISOString()
      };
      upsertJob(workingJob);
      workingRecords = workingRecords.map((record) =>
        record.stageId === "tts"
          ? {
              ...record,
              output: "自动生产正在根据分镜旁白生成同步配音音频...",
              status: "working",
              updatedAt: new Date().toISOString()
            }
          : record
      );
      upsertJobRecords(workingJob.id, workingRecords);
      const ttsResult = await requestTtsGeneration(workingJob, voiceoverText, getToolOverride("tts"));
      const ttsNow = new Date().toISOString();
      workingJob = {
        ...workingJob,
        actualCostRM: Number((workingJob.actualCostRM + ttsResult.costRM).toFixed(4)),
        reviewStatus: "draft",
        status: ttsResult.status,
        updatedAt: ttsNow
      };
      workingRecords = applyTtsGenerationResultToRecords(workingRecords, workingJob.id, ttsResult, ttsNow);
      upsertJob(workingJob);
      upsertJobRecords(workingJob.id, workingRecords);
      appendCaseActivity(workingJob.id, "stage_updated", "配音已生成", `${ttsResult.provider} ${ttsResult.model} 已生成同步旁白音频。成本 RM ${ttsResult.costRM.toFixed(4)}。`);

      assertCaseBudgetAvailable(workingJob, "自动合成 MP4");
      setAutoGenerateStep(`${options.sourceLabel}: 合成 MP4`);
      workingJob = {
        ...workingJob,
        status: "COMPOSING",
        updatedAt: new Date().toISOString()
      };
      upsertJob(workingJob);
      workingRecords = workingRecords.map((record) =>
        record.stageId === "compose"
          ? {
              ...record,
              output: "自动生产正在用图片、字幕和同步配音合成 MP4...",
              status: "working",
              updatedAt: new Date().toISOString()
            }
          : record
      );
      upsertJobRecords(workingJob.id, workingRecords);
      const videoResult = await requestVideoGeneration(workingJob, getToolOverride("compose"));
      const videoNow = new Date().toISOString();
      const hasUploadTargets = activeTargetIds.length > 0;
      workingJob = {
        ...workingJob,
        actualCostRM: Number((workingJob.actualCostRM + videoResult.costRM).toFixed(4)),
        durationSeconds: videoResult.durationSeconds,
        reviewStatus: "needs_review",
        status: hasUploadTargets ? "READY_TO_UPLOAD" : "QC_PASSED",
        updatedAt: videoNow
      };
      workingRecords = applyGenerationResultToRecords(workingRecords, workingJob.id, videoResult, videoNow, hasUploadTargets);
      upsertJob(workingJob);
      upsertJobRecords(workingJob.id, workingRecords);
      setStoredVideos((currentVideos) => [createStoredVideoFromGeneration(workingJob!, videoResult), ...currentVideos.filter((currentVideo) => currentVideo.jobId !== workingJob!.id)]);
      appendCaseActivity(
        workingJob.id,
        "video_generated",
        "自动生成 MP4 完成",
        hasUploadTargets
          ? `最终 MP4 已生成：${videoResult.artifacts.finalVideo.publicUrl ?? videoResult.artifacts.finalVideo.storagePath}。等待人工审核后再执行私密上传。`
          : `最终 MP4 已生成：${videoResult.artifacts.finalVideo.publicUrl ?? videoResult.artifacts.finalVideo.storagePath}。未配置 YouTube 目标，所以这个 Case 会停在 MP4/QC。`
      );

      return workingJob;
    } catch (error) {
      const message = error instanceof Error ? error.message : "自动生产失败。";
      setGenerationError(message);

      if (workingJob) {
        const failedJob = {
          ...workingJob,
          status: "FAILED" as const,
          updatedAt: new Date().toISOString()
        };
        upsertJob(failedJob);
        upsertJobRecords(
          failedJob.id,
          workingRecords.map((record) =>
            record.status === "working"
              ? {
                  ...record,
                  notes: message,
                  output: message,
                  status: "failed",
                  updatedAt: failedJob.updatedAt
                }
              : record
          )
        );
        appendCaseActivity(failedJob.id, "error", "自动生产失败", message);
      }

      throw error;
    }
  }

  async function handleAutoGenerateCase() {
    if (isAutoGeneratingCase) {
      return;
    }

    const normalizedTopic = topic.trim();
    const normalizedGenre = genreText.trim();
    const routedTemplateType = inferTemplateTypeFromGenre(normalizedGenre || normalizedTopic);
    const selectedAssets = getSelectedDraftAssets();
    const normalizedPrompt = getEffectivePrompt(normalizedTopic, prompt, normalizedGenre, selectedAssets);
    const productionBrief = buildProductionBriefFromDraft(selectedAssets);
    const selectedSeries = selectedCaseSeriesId ? contentSeries.find((series) => series._id === selectedCaseSeriesId) ?? null : null;
    const selectedEpisode = selectedCaseEpisodeId ? seriesEpisodes.find((episode) => episode._id === selectedCaseEpisodeId) ?? null : null;
    const storyWorldId = selectedCaseStoryWorldId || selectedSeries?.storyWorldId || null;

    if (!normalizedTopic) {
      setGenerationError("请输入主题或想法，再开始自动写大纲并生成 MP4。");
      return;
    }

    if (apiState !== "online") {
      setGenerationError(`API 服务当前为 ${apiState}。自动生产需要连接 ${apiBaseUrl}。`);
      return;
    }

    const jobId = createId("job");
    const activeTargetIds = getEnabledPublishingTargetIds();
    const draftInput: NewJobInput = {
      id: jobId,
      backgroundAssetId: selectedAssets.background?._id ?? null,
      characterAssetIds: selectedAssets.assets.filter(isCharacterDesignAsset).map((asset) => asset._id),
      characterAssetId: selectedAssets.character?._id ?? null,
      characterId: selectedCharacterId,
      costLimitRM,
      episodeId: selectedEpisode?._id ?? null,
      genre: normalizedGenre || undefined,
      language,
      prompt: normalizedPrompt,
      productionBrief,
      sceneAssetIds: selectedAssets.assets.filter(isBackgroundDesignAsset).map((asset) => asset._id),
      sceneCount,
      seriesId: selectedSeries?._id ?? null,
      storyWorldId,
      templateType: routedTemplateType,
      topic: normalizedTopic
    };
    let workingJob: AdminJob | null = null;
    let workingRecords: JobProcessRecord[] = [];

    setGenerationError(null);
    setCaseDraftPreview(null);
    setIsAutoGeneratingCase(true);
    setAutoGenerateStep("生成脚本与分镜");

    try {
      const scriptResult = await requestDraftScriptStoryGeneration(
        {
          costLimitRM: draftInput.costLimitRM,
          durationSeconds: 45,
          genre: draftInput.genre,
          jobId,
          language: draftInput.language,
          prompt: draftInput.prompt,
          productionBrief: draftInput.productionBrief ?? undefined,
          sceneCount: draftInput.sceneCount,
          templateType: draftInput.templateType,
          topic: draftInput.topic
        },
        getToolOverride("llm")
      );
      const scriptNow = new Date().toISOString();

      workingJob = {
        ...createJob(draftInput),
        actualCostRM: scriptResult.costRM,
        interpretedIdea: scriptResult.interpretedIdea,
        outlineQc: scriptResult.outlineQc,
        reviewStatus: scriptResult.requiresReview ? "needs_review" : "draft",
        status: scriptResult.status,
        updatedAt: scriptNow,
        visualBible: scriptResult.visualBible
      };
      workingRecords = applyScriptStoryResultToRecords(createProcessRecordsForJob(workingJob, staffAgents, aiToolEndpoints), workingJob.id, scriptResult, scriptNow);
      upsertJob(workingJob);
      upsertJobRecords(workingJob.id, workingRecords);
      void handleBootstrapProductionAssets(workingJob);
      const attachedAssets = await attachSelectedAssetsToCase(workingJob, selectedAssets.assets);
      setCasePublishTargets((currentTargets) => [...createCasePublishTargets(workingJob!.id, activeTargetIds), ...currentTargets.filter((target) => target.jobId !== workingJob!.id)]);
      addCaseActivities([
        createCaseActivity({
          detail: "自动生产已根据 AI 大纲建立这个生产 Case。",
          jobId: workingJob.id,
          title: "Case 已建立",
          type: "case_created"
        }),
        createCaseActivity({
          detail: `${scriptResult.provider} ${scriptResult.model} 已生成脚本、分镜和图片提示词。`,
          jobId: workingJob.id,
          title: "脚本与分镜已生成",
          type: "script_generated"
        })
      ]);
      setSelectedJobId(workingJob.id);
      switchView("cases");

      if (scriptResult.requiresReview) {
        throw new Error(`大纲质检需要人工确认后才能生成图片。${scriptResult.outlineQc.summary}`);
      }

      assertCaseBudgetAvailable(workingJob, "自动生成图片");
      setAutoGenerateStep("生成场景图片");
      workingJob = {
        ...workingJob,
        status: "IMAGE_GENERATING",
        updatedAt: new Date().toISOString()
      };
      upsertJob(workingJob);
      workingRecords = workingRecords.map((record) =>
        record.stageId === "image"
          ? {
              ...record,
              output: "自动生产正在生成可审核的场景图片...",
              status: "working",
              updatedAt: new Date().toISOString()
            }
          : record
      );
      upsertJobRecords(workingJob.id, workingRecords);
      const imageResult = await requestSequentialSceneImages(
        workingJob,
        workingJob.characterId ? characterProfiles.find((character) => character.id === workingJob?.characterId) ?? null : null,
        getGenerationReferencesForJob(workingJob, attachedAssets),
        getToolOverride("image"),
        workingRecords
      );
      const imageNow = new Date().toISOString();
      workingJob = {
        ...workingJob,
        actualCostRM: Number((workingJob.actualCostRM + imageResult.costRM).toFixed(4)),
        reviewStatus: imageResult.requiresReview ? "needs_review" : workingJob.reviewStatus,
        status: keepLaterStatus(workingJob.status, imageResult.status),
        updatedAt: imageNow
      };
      workingRecords = applyImageGenerationResultToRecords(workingRecords, workingJob.id, imageResult, imageNow);
      setSceneReviews((currentReviews) => [
        ...createSceneReviewItems(workingJob!.id, imageResult.images, currentReviews),
        ...currentReviews.filter((review) => review.jobId !== workingJob!.id)
      ]);
      upsertJob(workingJob);
      upsertJobRecords(workingJob.id, workingRecords);
      appendCaseActivity(workingJob.id, "stage_updated", "图片已生成", `${imageResult.provider} ${imageResult.model} 已生成 ${imageResult.images.length} 张场景图片。成本 RM ${imageResult.costRM.toFixed(4)}。`);

      if (imageResult.requiresReview) {
        throw new Error("图片视觉 QC 发现问题。请检查生成图，重跑失败场景后再继续配音和 MP4。");
      }

      assertCaseBudgetAvailable(workingJob, "自动生成配音");
      setAutoGenerateStep("生成配音");
      const voiceoverText = extractVoiceoverTextFromRecords(workingRecords, workingJob.id);

      if (!voiceoverText) {
        throw new Error("自动生产找不到分镜旁白文本，无法生成 TTS 配音。");
      }

      workingJob = {
        ...workingJob,
        status: "TTS_GENERATING",
        updatedAt: new Date().toISOString()
      };
      upsertJob(workingJob);
      workingRecords = workingRecords.map((record) =>
        record.stageId === "tts"
          ? {
              ...record,
              output: "自动生产正在根据分镜旁白生成同步配音音频...",
              status: "working",
              updatedAt: new Date().toISOString()
            }
          : record
      );
      upsertJobRecords(workingJob.id, workingRecords);
      const ttsResult = await requestTtsGeneration(workingJob, voiceoverText, getToolOverride("tts"));
      const ttsNow = new Date().toISOString();
      workingJob = {
        ...workingJob,
        actualCostRM: Number((workingJob.actualCostRM + ttsResult.costRM).toFixed(4)),
        reviewStatus: "draft",
        status: ttsResult.status,
        updatedAt: ttsNow
      };
      workingRecords = applyTtsGenerationResultToRecords(workingRecords, workingJob.id, ttsResult, ttsNow);
      upsertJob(workingJob);
      upsertJobRecords(workingJob.id, workingRecords);
      appendCaseActivity(workingJob.id, "stage_updated", "配音已生成", `${ttsResult.provider} ${ttsResult.model} 已生成同步旁白音频。成本 RM ${ttsResult.costRM.toFixed(4)}。`);

      assertCaseBudgetAvailable(workingJob, "自动合成 MP4");
      setAutoGenerateStep("合成 MP4");
      workingJob = {
        ...workingJob,
        status: "COMPOSING",
        updatedAt: new Date().toISOString()
      };
      upsertJob(workingJob);
      workingRecords = workingRecords.map((record) =>
        record.stageId === "compose"
          ? {
              ...record,
              output: "自动生产正在用图片、字幕和同步配音合成 MP4...",
              status: "working",
              updatedAt: new Date().toISOString()
            }
          : record
      );
      upsertJobRecords(workingJob.id, workingRecords);
      const videoResult = await requestVideoGeneration(workingJob, getToolOverride("compose"));
      const videoNow = new Date().toISOString();
      const hasUploadTargets = activeTargetIds.length > 0;
      workingJob = {
        ...workingJob,
        actualCostRM: Number((workingJob.actualCostRM + videoResult.costRM).toFixed(4)),
        durationSeconds: videoResult.durationSeconds,
        reviewStatus: "needs_review",
        status: hasUploadTargets ? "READY_TO_UPLOAD" : "QC_PASSED",
        updatedAt: videoNow
      };
      workingRecords = applyGenerationResultToRecords(workingRecords, workingJob.id, videoResult, videoNow, hasUploadTargets);
      upsertJob(workingJob);
      upsertJobRecords(workingJob.id, workingRecords);
      setStoredVideos((currentVideos) => [createStoredVideoFromGeneration(workingJob!, videoResult), ...currentVideos.filter((currentVideo) => currentVideo.jobId !== workingJob!.id)]);
      appendCaseActivity(
        workingJob.id,
        "video_generated",
        "自动生成 MP4 完成",
        hasUploadTargets
          ? `最终 MP4 已生成：${videoResult.artifacts.finalVideo.publicUrl ?? videoResult.artifacts.finalVideo.storagePath}。等待人工审核后再执行私密上传。`
          : `最终 MP4 已生成：${videoResult.artifacts.finalVideo.publicUrl ?? videoResult.artifacts.finalVideo.storagePath}。未配置 YouTube 目标，所以这个 Case 会停在 MP4/QC。`
      );
    } catch (error) {
      const message = error instanceof Error ? error.message : "自动生产失败。";
      setGenerationError(message);

      if (workingJob) {
        const failedJob = {
          ...workingJob,
          status: "FAILED" as const,
          updatedAt: new Date().toISOString()
        };
        upsertJob(failedJob);
        upsertJobRecords(
          failedJob.id,
          workingRecords.map((record) =>
            record.status === "working"
              ? {
                  ...record,
                  notes: message,
                  output: message,
                  status: "failed",
                  updatedAt: failedJob.updatedAt
                }
              : record
          )
        );
        appendCaseActivity(failedJob.id, "error", "自动生产失败", message);
      }
    } finally {
      setAutoGenerateStep(null);
      setIsAutoGeneratingCase(false);
      setSelectedCharacterAssetId(null);
      setSelectedBackgroundAssetId(null);
    }
  }

  function updateJob(id: string, updater: (job: AdminJob) => AdminJob) {
    const currentJob = jobs.find((job) => job.id === id);

    if (!currentJob) {
      return;
    }

    const updatedJob = updater(currentJob);
    setJobs((currentJobs) => currentJobs.map((job) => (job.id === id ? updatedJob : job)));
    setJobProcessRecords((currentRecords) => syncProcessRecordsWithJob(updatedJob, currentRecords, staffAgents));
    if (updatedJob.status !== currentJob.status) {
      const type: CaseActivityType = updatedJob.status === "FAILED" ? "case_failed" : currentJob.status === "FAILED" ? "case_retried" : "case_advanced";
      appendCaseActivity(id, type, "Case 状态已更新", `${currentJob.status} -> ${updatedJob.status}`);
    }
    setSelectedJobId(id);
  }

  function updateCaseDetails(id: string, patch: Partial<Pick<AdminJob, "backgroundAssetId" | "characterAssetId" | "characterId" | "costLimitRM" | "prompt" | "sceneCount" | "topic">>) {
    setJobs((currentJobs) =>
      currentJobs.map((job) =>
        job.id === id
          ? {
              ...job,
              ...patch,
              updatedAt: new Date().toISOString()
            }
          : job
      )
    );
  }

  function updateSceneReview(id: string, updater: (review: SceneReviewItem) => SceneReviewItem) {
    const currentReview = sceneReviews.find((review) => review.id === id);
    const nextReview = currentReview ? updater(currentReview) : null;

    setSceneReviews((currentReviews) =>
      currentReviews.map((review) =>
        review.id === id
          ? {
              ...updater(review),
              updatedAt: new Date().toISOString()
            }
          : review
      )
    );

    if (currentReview && nextReview && currentReview.status !== nextReview.status) {
      appendCaseActivity(currentReview.jobId, "stage_updated", `Scene ${currentReview.sceneId} review changed`, `${currentReview.status} -> ${nextReview.status}`);
    }
  }

  async function refreshProductionAssets() {
    setIsLoadingProductionAssets(true);

    try {
      const response = await requestProductionAssets();

      setProductionAssets(response.assets);
      setAssetError(null);
      setSelectedProductionAssetId((currentId) => {
        if (currentId && response.assets.some((asset) => asset._id === currentId)) {
          return currentId;
        }

        return null;
      });
    } catch (error) {
      setAssetError(error instanceof Error ? error.message : "生产资产加载失败。");
    } finally {
      setIsLoadingProductionAssets(false);
    }
  }

  async function refreshSeries() {
    setIsLoadingSeries(true);

    try {
      const response = await requestContentSeries();
      const nextSelectedId = selectedSeriesId && response.series.some((series) => series._id === selectedSeriesId)
        ? selectedSeriesId
        : response.series[0]?._id ?? null;

      setContentSeries(response.series);
      setSelectedSeriesId(nextSelectedId);
      if (nextSelectedId) {
        await refreshSeriesEpisodes(nextSelectedId);
      } else {
        setSeriesEpisodes([]);
      }
      setSeriesError(null);
    } catch (error) {
      setSeriesError(error instanceof Error ? error.message : "Series load failed.");
    } finally {
      setIsLoadingSeries(false);
    }
  }

  async function refreshStoryWorlds() {
    try {
      const response = await requestStoryWorlds();
      setStoryWorlds(response.storyWorlds);
      setSeriesError(null);
    } catch (error) {
      setSeriesError(error instanceof Error ? error.message : "Story worlds load failed.");
    }
  }

  async function refreshSeriesEpisodes(seriesId: string) {
    try {
      const response = await requestSeriesEpisodes(seriesId);
      setSeriesEpisodes(response.episodes);
      setSeriesError(null);
    } catch (error) {
      setSeriesError(error instanceof Error ? error.message : "Series episodes load failed.");
    }
  }

  function selectSeries(seriesId: string | null) {
    setSelectedSeriesId(seriesId);
    setSeriesEpisodes([]);
    if (seriesId) {
      void refreshSeriesEpisodes(seriesId);
    }
  }

  async function handleCreateSeries() {
    if (apiState !== "online") {
      setSeriesError(`API 服务当前为 ${apiState}。系列题库需要连接 ${apiBaseUrl}。`);
      return;
    }

    try {
      const response = await requestCreateContentSeries({
        audience: "未指定目标观众",
        contentType: "自定义影片类型",
        continuityRules: "",
        description: "",
        dramaIntensity: "medium",
        durationSeconds: 45,
        language: "zh-CN",
        musicStyle: "",
        narrativeMode: "standalone",
        name: "未命名系列",
        referenceAssetIds: [],
        safetyRules: "原创、不抄袭、不使用版权角色、不伪造真实人物；具体禁忌按这个系列的定位补充。",
        sceneCount: 5,
        status: "draft",
        storyWorldId: null,
        tone: "",
        values: "",
        visualStyle: ""
      });

      setContentSeries((currentSeries) => [response.series, ...currentSeries.filter((series) => series._id !== response.series._id)]);
      selectSeries(response.series._id);
      setSeriesError(null);
    } catch (error) {
      setSeriesError(error instanceof Error ? error.message : "Series create failed.");
    }
  }

  async function handleCreateStoryWorld(input: Omit<StoryWorld, "_id" | "createdAt" | "updatedAt">) {
    if (apiState !== "online") {
      setSeriesError(`API 服务当前为 ${apiState}，背景故事库需要连接 ${apiBaseUrl}。`);
      return null;
    }

    try {
      const response = await requestCreateStoryWorld(input);
      setStoryWorlds((currentStoryWorlds) => [response.storyWorld, ...currentStoryWorlds.filter((storyWorld) => storyWorld._id !== response.storyWorld._id)]);
      setSeriesError(null);
      return response.storyWorld;
    } catch (error) {
      setSeriesError(error instanceof Error ? error.message : "背景故事创建失败。");
      return null;
    }
  }

  async function handleUpdateSeries(id: string, patch: Partial<Omit<ContentSeries, "_id" | "createdAt" | "updatedAt">>) {
    try {
      const response = await requestPatchContentSeries(id, patch);
      setContentSeries((currentSeries) => currentSeries.map((series) => (series._id === id ? response.series : series)));
      setSeriesError(null);
    } catch (error) {
      setSeriesError(error instanceof Error ? error.message : "Series update failed.");
    }
  }

  async function handleDeleteSeries(id: string) {
    try {
      await requestDeleteContentSeries(id);
      setContentSeries((currentSeries) => currentSeries.filter((series) => series._id !== id));
      if (selectedSeriesId === id) {
        setSelectedSeriesId(null);
        setSeriesEpisodes([]);
      }
      setSeriesError(null);
    } catch (error) {
      setSeriesError(error instanceof Error ? error.message : "Series delete failed.");
    }
  }

  async function handleGenerateSeriesIdeas(seriesId: string, count: number) {
    if (apiState !== "online") {
      setSeriesError(`API 服务当前为 ${apiState}。AI 题库需要连接 ${apiBaseUrl}。`);
      return;
    }

    setGeneratingSeriesIdeaIds((currentIds) => [...currentIds, seriesId]);

    try {
      const response = await requestGenerateSeriesEpisodeIdeas(seriesId, count);
      setSeriesEpisodes((currentEpisodes) => [...response.episodes, ...currentEpisodes]);
      setSeriesError(null);
    } catch (error) {
      setSeriesError(error instanceof Error ? error.message : "Series episode idea generation failed.");
    } finally {
      setGeneratingSeriesIdeaIds((currentIds) => currentIds.filter((id) => id !== seriesId));
    }
  }

  async function handleUpdateSeriesEpisode(seriesId: string, episodeId: string, patch: Partial<Omit<SeriesEpisodeIdea, "_id" | "createdAt" | "seriesId" | "updatedAt">>) {
    try {
      const response = await requestPatchSeriesEpisodeIdea(seriesId, episodeId, patch);
      setSeriesEpisodes((currentEpisodes) => currentEpisodes.map((episode) => (episode._id === episodeId ? response.episode : episode)));
      setSeriesError(null);
    } catch (error) {
      setSeriesError(error instanceof Error ? error.message : "Series episode update failed.");
    }
  }

  async function handleDeleteSeriesEpisode(seriesId: string, episodeId: string) {
    try {
      await requestDeleteSeriesEpisodeIdea(seriesId, episodeId);
      setSeriesEpisodes((currentEpisodes) => currentEpisodes.filter((episode) => episode._id !== episodeId));
      setSeriesError(null);
    } catch (error) {
      setSeriesError(error instanceof Error ? error.message : "Series episode delete failed.");
    }
  }

  async function handleConvertSeriesEpisodeToCase(series: ContentSeries, episode: SeriesEpisodeIdea) {
    if (apiState !== "online") {
      setSeriesError(`API 服务当前为 ${apiState}。单集转 Case 需要连接 ${apiBaseUrl}。`);
      return;
    }

    const caseId = createId("job");

    try {
      const latestAssetsResponse = await requestProductionAssets();
      const latestProductionAssets = latestAssetsResponse.assets;
      setProductionAssets(latestProductionAssets);

      const response = await requestConvertSeriesEpisodeToCase(series._id, episode._id, caseId);
      const seedReferenceIds = [...response.caseSeed.referenceAssetIds, ...response.caseSeed.characterAssetIds, ...response.caseSeed.sceneAssetIds]
        .filter((id, index, ids) => ids.indexOf(id) === index);
      const referenceAssets = findReadyReferenceAssetsByIds(latestProductionAssets, seedReferenceIds);
      const missingReferenceCount = Math.max(0, seedReferenceIds.length - referenceAssets.length);
      const splitSeedAssetIds = splitReadyReferenceAssetIdsByType(seedReferenceIds, latestProductionAssets);
      const characterAssetIds = splitSeedAssetIds.characterAssetIds;
      const sceneAssetIds = splitSeedAssetIds.sceneAssetIds;
      const characterAsset = referenceAssets.find(isCharacterDesignAsset) ?? null;
      const backgroundAsset = referenceAssets.find(isBackgroundDesignAsset) ?? null;
      const productionBrief = enrichProductionBriefWithReferenceAssets(response.caseSeed.productionBrief, referenceAssets);
      const job = createJob({
        backgroundAssetId: response.caseSeed.backgroundAssetId ?? backgroundAsset?._id ?? null,
        characterAssetIds,
        characterAssetId: response.caseSeed.characterAssetId ?? characterAsset?._id ?? null,
        costLimitRM: budgetSettings.defaultCaseBudgetRM,
        durationSeconds: response.caseSeed.durationSeconds,
        episodeId: response.caseSeed.episodeId,
        genre: response.caseSeed.genre,
        id: response.caseSeed.id,
        language: response.caseSeed.language,
        prompt: response.caseSeed.prompt,
        productionBrief,
        sceneAssetIds,
        sceneCount: response.caseSeed.sceneCount,
        seriesId: response.caseSeed.seriesId,
        storyWorldId: response.caseSeed.storyWorldId,
        templateType: response.caseSeed.templateType,
        topic: response.caseSeed.topic
      });

      setJobs((currentJobs) => [job, ...currentJobs]);
      setJobProcessRecords((currentRecords) => [...createProcessRecordsForJob(job, staffAgents, aiToolEndpoints), ...currentRecords]);
      setCasePublishTargets((currentTargets) => [...createCasePublishTargets(job.id, getEnabledPublishingTargetIds()), ...currentTargets]);
      appendCaseActivity(job.id, "case_created", "已从系列题库建立 Case", `系列：${series.name}。单集：${episode.title}。`);
      await handleBootstrapProductionAssets(job);
      const attachedAssets = await attachSelectedAssetsToCase(job, referenceAssets);

      if (seedReferenceIds.length > 0 && referenceAssets.length === 0) {
        appendCaseActivity(job.id, "error", "Series reference assets not available", "This episode has bound asset IDs, but none were ready/approved with usable media in MongoDB when converting to Case.");
      } else if (missingReferenceCount > 0) {
        appendCaseActivity(job.id, "error", "Some series references were skipped", `${missingReferenceCount} bound asset(s) were missing, not ready, or did not have usable media.`);
      } else if (attachedAssets.length > 0) {
        appendCaseActivity(job.id, "stage_updated", "Series references inherited", `${attachedAssets.length} bound reference asset(s) were copied into this Case.`);
      }

      setSeriesEpisodes((currentEpisodes) => currentEpisodes.map((currentEpisode) => (currentEpisode._id === episode._id ? response.episode : currentEpisode)));
      setSelectedJobId(job.id);
      setSeriesError(null);
      switchView("cases");
    } catch (error) {
      setSeriesError(error instanceof Error ? error.message : "Series episode convert failed.");
    }
  }

  async function handleBootstrapProductionAssets(job: AdminJob) {
    if (apiState !== "online") {
      setAssetError(`API 服务当前为 ${apiState}。资产规划需要连接 ${apiBaseUrl}。`);
      return;
    }

    try {
      const response = await requestBootstrapProductionAssets({
        jobId: job.id,
        prompt: job.prompt,
        sceneCount: job.sceneCount,
        topic: job.topic
      });

      setAssetFilterJobId(job.id);
      setProductionAssets((currentAssets) => [
        ...response.assets,
        ...currentAssets.filter((asset) => asset.jobId !== job.id || !response.assets.some((responseAsset) => responseAsset._id === asset._id))
      ]);
      setSelectedProductionAssetId(response.assets[0]?._id ?? null);
      setAssetError(null);
      appendCaseActivity(job.id, "stage_updated", "Asset plan bootstrapped", `${response.created} MongoDB production asset row(s) created or refreshed.`);
    } catch (error) {
      const message = error instanceof Error ? error.message : "Asset plan bootstrap failed.";
      setAssetError(message);
      appendCaseActivity(job.id, "error", "Asset plan bootstrap failed", message);
    }
  }

  function getReferenceAssetsFromIds(...assetIds: Array<string | string[] | null | undefined>): ProductionAsset[] {
    return findReadyReferenceAssetsByIds(productionAssets, assetIds);
  }

  function getGenerationReferencesForJob(job: AdminJob, extraAssets: ProductionAsset[] = []): GenerationReferenceAsset[] {
    const seriesReferenceAssetIds = job.seriesId
      ? contentSeries.find((series) => series._id === job.seriesId)?.referenceAssetIds ?? []
      : [];
    const selectedAssetIds = new Set([
      job.characterAssetId,
      job.backgroundAssetId,
      ...(job.characterAssetIds ?? []),
      ...seriesReferenceAssetIds,
      ...(job.sceneAssetIds ?? [])
    ].filter((id): id is string => Boolean(id)));
    const assets = [...extraAssets, ...productionAssets]
      .filter((asset) => asset.jobId === job.id || selectedAssetIds.has(asset._id))
      .filter(isReadyReferenceAsset);
    const uniqueAssets = assets.filter((asset, index) => assets.findIndex((candidate) => getProductionAssetMediaUrl(candidate) === getProductionAssetMediaUrl(asset)) === index);

    return uniqueAssets
      .map(productionAssetToGenerationReference)
      .filter((reference): reference is GenerationReferenceAsset => Boolean(reference));
  }

  function getReferenceGenerationBlocker(job: AdminJob, references: GenerationReferenceAsset[]): string | null {
    const selectedCharacterIds = [job.characterAssetId, ...(job.characterAssetIds ?? [])].filter((id): id is string => Boolean(id));
    const selectedSceneIds = [job.backgroundAssetId, ...(job.sceneAssetIds ?? [])].filter((id): id is string => Boolean(id));
    const hasCharacterReference = references.some((reference) => reference.type === "character_design");
    const hasSceneReference = references.some((reference) => reference.type === "scene_design" || reference.type === "style_reference" || reference.type === "first_frame" || reference.type === "last_frame");

    if (selectedCharacterIds.length > 0 && !hasCharacterReference) {
      return "这个 Case 有选定角色资产，但没有可用的角色参考图。请到「设计资产」确认角色设计已保存入库、状态为已保存/已批准，并且图片 URL 可打开后再生成图片。系统不会在缺少角色参考图时擅自换角色。";
    }

    if (selectedSceneIds.length > 0 && !hasSceneReference) {
      return "这个 Case 有选定场景资产，但没有可用的场景/风格参考图。请到「设计资产」确认场景设计已保存入库、状态为已保存/已批准，并且图片 URL 可打开后再生成图片。";
    }

    return null;
  }

  async function attachSelectedAssetsToCase(job: AdminJob, selectedAssets: ProductionAsset[]): Promise<ProductionAsset[]> {
    const uniqueAssets = selectedAssets
      .filter(isReadyReferenceAsset)
      .filter((asset, index, assets) => assets.findIndex((candidate) => candidate._id === asset._id) === index);

    if (uniqueAssets.length === 0) {
      return [];
    }

    const attachedAssets: ProductionAsset[] = [];

    for (const asset of uniqueAssets) {
      try {
        const response = await requestCreateProductionAsset({
          costRM: asset.costRM,
          folderName: `Case ${job.id} / 参考资产`,
          jobId: job.id,
          label: asset.type === "character_design" ? `角色参考：${asset.label}` : `背景参考：${asset.label}`,
          notes: [
            `从设计资产库绑定：${asset.folderName || "未分类"} / ${asset.label}`,
            asset.notes
          ].filter(Boolean).join("\n"),
          prompt: asset.prompt,
          provider: asset.provider,
          role: asset.type === "first_frame" ? "first_frame" : "reference_image",
          scope: asset.type === "first_frame" ? "scene" : "case",
          status: asset.status,
          storagePath: asset.storagePath,
          tags: [...asset.tags, "case_reference"],
          type: asset.type,
          url: getProductionAssetMediaUrl(asset)
        });

        attachedAssets.push(response.asset);
        setProductionAssets((currentAssets) => [response.asset, ...currentAssets.filter((currentAsset) => currentAsset._id !== response.asset._id)]);
      } catch (error) {
        setAssetError(error instanceof Error ? error.message : "参考资产绑定失败。");
      }
    }

    if (attachedAssets.length > 0) {
      appendCaseActivity(job.id, "stage_updated", "参考资产已绑定", `已绑定 ${attachedAssets.length} 张角色 / 背景参考图到这个 Case。`);
    }

    return attachedAssets;
  }

  async function handleCreateProductionAsset(job: AdminJob | null) {
    const targetJob = job ?? selectedJob;
    const targetJobId = targetJob?.id ?? libraryJobId;

    try {
      const response = await requestCreateProductionAsset({
        folderName: targetJob ? `Case ${targetJob.id}` : "通用设计库",
        jobId: targetJobId,
        label: "手动参考资产",
        notes: "手动建立的 MongoDB 资产。贴上图片 URL，确认后可作为 Seedance 参考图。",
        provider: "manual",
        role: "reference_image",
        scope: "case",
        status: "planned",
        type: "style_reference"
      });

      setProductionAssets((currentAssets) => [response.asset, ...currentAssets.filter((asset) => asset._id !== response.asset._id)]);
      setSelectedProductionAssetId(response.asset._id);
      setAssetFilterJobId(targetJob?.id ?? "");
      setAssetError(null);
      if (targetJob) {
        appendCaseActivity(targetJob.id, "stage_updated", "生产资产行已新增", "已建立一条手动 MongoDB 资产规划记录。");
      }
    } catch (error) {
      setAssetError(error instanceof Error ? error.message : "生产资产创建失败。");
    }
  }

  async function handleCreateDesignProductionAsset(input: { folderName: string; jobId?: string | undefined; label: string; prompt: string; tags: string[]; type: ProductionAssetType }): Promise<ProductionAsset | null> {
    if (apiState !== "online") {
      setAssetError(`API 服务当前为 ${apiState}。设计生成需要连接 ${apiBaseUrl}。`);
      return null;
    }

    setSelectedProductionAssetId(null);

    try {
      const response = await requestCreateProductionAsset({
        folderName: input.folderName,
        jobId: input.jobId ?? libraryJobId,
        label: input.label,
        notes: "由设计管理中心创建的 OpenAI 设计草稿。满意后点击保存入库。",
        prompt: input.prompt,
        provider: "openai",
        role: defaultProductionAssetRole(input.type),
        scope: input.jobId ? "case" : "case",
        status: "planned",
        tags: input.tags,
        type: input.type
      });

      setProductionAssets((currentAssets) => [response.asset, ...currentAssets.filter((asset) => asset._id !== response.asset._id)]);
      setSelectedProductionAssetId(response.asset._id);
      setAssetFilterJobId(input.jobId ?? "");
      setAssetError(null);
      await handleGenerateProductionAsset(response.asset);
      return response.asset;
    } catch (error) {
      setAssetError(error instanceof Error ? error.message : "设计资产创建失败。");
      return null;
    }
  }

  async function handleCloneProductionAsset(asset: ProductionAsset): Promise<ProductionAsset | null> {
    if (apiState !== "online") {
      setAssetError(`API 服务当前为 ${apiState}。复制资产版本需要连接 ${apiBaseUrl}。`);
      return null;
    }

    try {
      const response = await requestCreateProductionAsset(buildProductionAssetVersionDraft(asset));

      setProductionAssets((currentAssets) => [response.asset, ...currentAssets.filter((currentAsset) => currentAsset._id !== response.asset._id)]);
      setSelectedProductionAssetId(response.asset._id);
      setAssetFilterJobId(response.asset.jobId === libraryJobId ? "" : response.asset.jobId);
      setAssetError(null);
      appendCaseActivity(asset.jobId, "stage_updated", "资产版本草稿已建立", `${response.asset.label} 已从 ${asset.label} 复制；原本已批准的资产会保留。`);
      return response.asset;
    } catch (error) {
      setAssetError(error instanceof Error ? error.message : "资产版本草稿创建失败。");
      return null;
    }
  }

  async function handleUpdateProductionAsset(id: string, patch: Partial<Pick<ProductionAsset, "costRM" | "error" | "folderName" | "label" | "notes" | "prompt" | "provider" | "role" | "sceneId" | "scope" | "status" | "storagePath" | "tags" | "type" | "url">>) {
    try {
      const response = await requestPatchProductionAsset(id, patch);

      setProductionAssets((currentAssets) => currentAssets.map((asset) => (asset._id === id ? response.asset : asset)));
      setAssetError(null);
    } catch (error) {
      setAssetError(error instanceof Error ? error.message : "生产资产更新失败。");
    }
  }

  async function handleDeleteProductionAsset(id: string) {
    const asset = productionAssets.find((candidate) => candidate._id === id);

    try {
      await requestDeleteProductionAsset(id);
      setProductionAssets((currentAssets) => currentAssets.filter((candidate) => candidate._id !== id));
      setSelectedProductionAssetId((currentId) => (currentId === id ? null : currentId));
      setAssetError(null);

      if (asset) {
        appendCaseActivity(asset.jobId, "stage_updated", "生产资产已删除", `${asset.label} 已从 MongoDB production_assets 移除。`);
      }
    } catch (error) {
      setAssetError(error instanceof Error ? error.message : "生产资产删除失败。");
    }
  }

  async function handleGenerateProductionAsset(asset: ProductionAsset) {
    if (generatingProductionAssetIds.includes(asset._id)) {
      return;
    }

    const job = jobs.find((candidate) => candidate.id === asset.jobId) ?? null;

    if (job && blockIfCaseBudgetExceeded(job, "生产资产生成")) {
      return;
    }

    if (apiState !== "online") {
      const message = `API 服务当前为 ${apiState}。生产资产生成需要连接 ${apiBaseUrl}。`;
      setAssetError(message);
      appendCaseActivity(asset.jobId, "error", "生产资产生成被阻止", message);
      return;
    }

    setSelectedProductionAssetId(asset._id);
    setGeneratingProductionAssetIds((currentIds) => [...currentIds, asset._id]);

    try {
      const response = await requestProductionAssetGeneration(asset, job, getToolOverride("design_image"));

      setProductionAssets((currentAssets) => currentAssets.map((currentAsset) => (currentAsset._id === asset._id ? response.asset : currentAsset)));
      setJobs((currentJobs) =>
        currentJobs.map((currentJob) =>
          currentJob.id === asset.jobId
            ? {
                ...currentJob,
                actualCostRM: Number((currentJob.actualCostRM + response.costRM).toFixed(4)),
                updatedAt: new Date().toISOString()
              }
            : currentJob
        )
      );
      setAssetError(null);
      appendCaseActivity(asset.jobId, "stage_updated", "生产资产已生成", `${response.asset.type} 已生成并写入 MongoDB production_assets。成本 RM ${response.costRM.toFixed(4)}。`);
    } catch (error) {
      const message = error instanceof Error ? error.message : "生产资产生成失败。";
      setAssetError(message);
      appendCaseActivity(asset.jobId, "error", "生产资产生成失败", message);
      await refreshProductionAssets();
    } finally {
      setGeneratingProductionAssetIds((currentIds) => currentIds.filter((id) => id !== asset._id));
    }
  }

  async function handleImportLegacyProductionAssets() {
    if (caseReferenceAssets.length === 0) {
      setAssetError("No legacy local draft assets were found in this browser.");
      return;
    }

    try {
      const created = await Promise.all(
        caseReferenceAssets.map((asset) =>
          requestCreateProductionAsset({
            folderName: "导入旧草稿",
            jobId: asset.jobId,
            label: asset.label,
            notes: asset.notes,
            provider: "local",
            role: asset.role,
            sceneId: asset.sceneId,
            scope: asset.sceneId ? "scene" : "case",
            status: asset.enabled && asset.url ? "ready" : "planned",
            storagePath: asset.url,
            tags: ["legacy-import"],
            type: asset.type,
            url: resolveMediaUrl(asset.url)
          })
        )
      );

      setProductionAssets((currentAssets) => [...created.map((item) => item.asset), ...currentAssets]);
      setSelectedProductionAssetId(created[0]?.asset._id ?? selectedProductionAssetId);
      setAssetError(null);
    } catch (error) {
      setAssetError(error instanceof Error ? error.message : "Legacy asset import failed.");
    }
  }

  function openAssetPlanForJob(jobId: string) {
    setAssetFilterJobId(jobId);
    switchView("assets");
  }

  function updateProcessRecord(id: string, updater: (record: JobProcessRecord) => JobProcessRecord) {
    const currentRecord = jobProcessRecords.find((record) => record.id === id);
    const updatedPreview = currentRecord ? updater(currentRecord) : null;

    setJobProcessRecords((currentRecords) =>
      currentRecords.map((record) =>
        record.id === id
          ? {
              ...updater(record),
              updatedAt: new Date().toISOString()
            }
          : record
      )
    );

    if (currentRecord && updatedPreview && updatedPreview.status !== currentRecord.status) {
      appendCaseActivity(currentRecord.jobId, "stage_updated", "Stage status changed", `${currentRecord.stageName}: ${currentRecord.status} -> ${updatedPreview.status}`);
    }
  }

  function addVideoForJob(job: AdminJob) {
    setStoredVideos((currentVideos) => {
      if (currentVideos.some((video) => video.jobId === job.id)) {
        return currentVideos;
      }

      return [createStoredVideoFromJob(job, storageSettings), ...currentVideos];
    });
    appendCaseActivity(job.id, "stored", "影片已登记入库", `影片已登记到 ${storageSettings.driver === "local" ? "本地 uploads" : storageSettings.driver.toUpperCase()} 存储。`);
    switchView("storage");
  }

  async function handleGenerateScriptStory(job: AdminJob) {
    if (generatingScriptCaseIds.includes(job.id)) {
      return;
    }

    const isOverwritingExistingScript = hasGeneratedScriptStory(jobProcessRecords, job.id);

    if (isOverwritingExistingScript && !window.confirm("这个 Case 已经有已确认脚本、分镜和图片提示词。重新生成会覆盖脚本，并把图片、配音、字幕、BGM、视频片段、MP4 和 QC 标记为需要重跑。确定继续吗？")) {
      return;
    }

    if (blockIfCaseBudgetExceeded(job, "脚本/分镜生成")) {
      return;
    }

    if (apiState !== "online") {
      const message = `API 服务当前为 ${apiState}。脚本生成需要连接 ${apiBaseUrl}。`;
      setGenerationError(message);
      appendCaseActivity(job.id, "error", "脚本生成被阻止", message);
      return;
    }

    setGenerationError(null);
    setGeneratingScriptCaseIds((currentIds) => [...currentIds, job.id]);
    setJobs((currentJobs) =>
      currentJobs.map((currentJob) =>
        currentJob.id === job.id
          ? {
              ...currentJob,
              status: "SCRIPT_GENERATING",
              updatedAt: new Date().toISOString()
            }
          : currentJob
      )
    );

    try {
      const result = await requestScriptStoryGeneration(job, getToolOverride("llm"));
      const now = new Date().toISOString();

      setJobs((currentJobs) =>
        currentJobs.map((currentJob) =>
          currentJob.id === job.id
            ? {
                ...currentJob,
                actualCostRM: Number((currentJob.actualCostRM + result.costRM).toFixed(4)),
                interpretedIdea: result.interpretedIdea,
                outlineQc: result.outlineQc,
                reviewStatus: result.requiresReview ? "needs_review" : currentJob.reviewStatus,
                status: result.status,
                updatedAt: now,
                visualBible: result.visualBible
              }
            : currentJob
        )
      );
      setJobProcessRecords((currentRecords) => {
        const updatedRecords = applyScriptStoryResultToRecords(currentRecords, job.id, result, now);
        return isOverwritingExistingScript ? resetDownstreamRecordsAfterScriptOverwrite(updatedRecords, job.id, now) : updatedRecords;
      });
      if (isOverwritingExistingScript) {
        setSceneReviews((currentReviews) => currentReviews.filter((review) => review.jobId !== job.id));
        setCaseQcReports((currentReports) => currentReports.filter((report) => report.jobId !== job.id));
        setStoredVideos((currentVideos) => currentVideos.filter((video) => video.jobId !== job.id));
        appendCaseActivity(job.id, "stage_updated", "脚本与分镜已覆盖", "脚本和分镜已被重新生成；下游图片、音频、字幕、MP4 和 QC 已标记为需要重跑。");
      }
      appendCaseActivity(job.id, "script_generated", isOverwritingExistingScript ? "脚本与分镜已覆盖" : "脚本与分镜已生成", `${result.provider} ${result.model} 已生成脚本、分镜和图片提示词。成本 RM ${result.costRM.toFixed(4)}。`);
      setSelectedJobId(job.id);
    } catch (error) {
      const message = error instanceof Error ? error.message : "脚本生成失败。";
      setGenerationError(message);
      setJobs((currentJobs) =>
        currentJobs.map((currentJob) =>
          currentJob.id === job.id
            ? {
                ...currentJob,
                status: "FAILED",
                updatedAt: new Date().toISOString()
              }
            : currentJob
        )
      );
      setJobProcessRecords((currentRecords) =>
        currentRecords.map((record) =>
          record.jobId === job.id && (record.stageId === "script" || record.stageId === "storyboard")
            ? {
                ...record,
                notes: message,
                output: message,
                status: "failed",
                updatedAt: new Date().toISOString()
              }
            : record
        )
      );
      appendCaseActivity(job.id, "error", "脚本生成失败", message);
    } finally {
      setGeneratingScriptCaseIds((currentIds) => currentIds.filter((id) => id !== job.id));
    }
  }

  async function requestSequentialSceneImages(
    job: AdminJob,
    character: CharacterProfile | null,
    references: GenerationReferenceAsset[],
    toolOverride: ToolProviderOverride | undefined,
    sourceRecords: JobProcessRecord[] = jobProcessRecords
  ): Promise<GenerateImagesResponse> {
    const referenceBlocker = getReferenceGenerationBlocker(job, references);

    if (referenceBlocker) {
      throw new Error(referenceBlocker);
    }

    const targets = getImageGenerationTargetsFromRecords(sourceRecords, job);

    if (targets.length === 0) {
      throw new Error("缺少已确认分镜，不能生成图片。请先重新生成脚本 / 分镜。");
    }

    let generatedImages: GeneratedImageAsset[] = [];
    let latestProvider = toolOverride?.provider ?? "openai";
    let latestModel = toolOverride?.model ?? "";
    let latestReferenceImage: GenerateImagesResponse["referenceImage"] | undefined;
    let latestVisualBible: GenerateImagesResponse["visualBible"] | undefined;

    setSceneReviews((currentReviews) => currentReviews.filter((review) => review.jobId !== job.id));

    for (const [index, target] of targets.entries()) {
      const operationId = `${job.id}_${target.sceneId}`;
      const progressLabel = `Scene ${target.sceneId} (${index + 1}/${targets.length})`;

      setGeneratingSceneImageIds((currentIds) => currentIds.includes(operationId) ? currentIds : [...currentIds, operationId]);
      setJobProcessRecords((currentRecords) =>
        currentRecords.map((record) =>
          record.jobId === job.id && record.stageId === "image"
            ? {
                ...record,
                notes: "",
                output: `逐场景生成图片中：${progressLabel}。已成功 ${generatedImages.length}/${targets.length} 张。`,
                status: "working",
                updatedAt: new Date().toISOString()
              }
            : record
        )
      );

      try {
        const result = await requestSceneImageGeneration(job, target.sceneId, target.prompt, character, references, toolOverride);
        const now = new Date().toISOString();
        latestProvider = result.provider;
        latestModel = result.model;
        latestReferenceImage = result.referenceImage;
        latestVisualBible = result.visualBible;
        generatedImages = replaceGeneratedImage(generatedImages, result.image);

        setSceneReviews((currentReviews) => [
          ...createSceneReviewItems(job.id, [result.image], currentReviews),
          ...currentReviews.filter((review) => review.jobId !== job.id || review.sceneId !== result.image.sceneId)
        ]);
        setJobProcessRecords((currentRecords) =>
          applySceneImageProgressToRecords(currentRecords, job.id, generatedImages, targets.length, latestProvider, latestModel, now)
        );
        appendCaseActivity(job.id, "stage_updated", `场景 ${target.sceneId} 图片已生成`, `${result.provider} ${result.model} 已生成 ${progressLabel}。成本 RM ${result.costRM.toFixed(4)}。`);
      } catch (error) {
        const rawMessage = error instanceof Error ? error.message : `Scene ${target.sceneId} image generation failed.`;
        const message = buildReadableImageGenerationError(rawMessage, generatedImages.length, targets.length);
        const now = new Date().toISOString();

        setJobProcessRecords((currentRecords) =>
          applySceneImageProgressToRecords(currentRecords, job.id, generatedImages, targets.length, latestProvider, latestModel, now, { errorMessage: message })
        );
        appendCaseActivity(job.id, "error", `场景 ${target.sceneId} 图片失败`, message);
        throw new Error(message);
      } finally {
        setGeneratingSceneImageIds((currentIds) => currentIds.filter((id) => id !== operationId));
      }
    }

    if (!latestVisualBible) {
      throw new Error("图片生成没有返回视觉圣经资料，请重新生成脚本 / 分镜后再试。");
    }

    return {
      costRM: Number(generatedImages.reduce((sum, image) => sum + image.costRM, 0).toFixed(4)),
      images: generatedImages,
      jobId: job.id,
      model: latestModel,
      provider: latestProvider,
      referenceImage: latestReferenceImage,
      requiresReview: generatedImages.some((image) => image.qualityCheck?.status === "fail"),
      status: "IMAGE_DONE",
      visualBible: latestVisualBible
    };
  }

  async function handleGenerateImages(job: AdminJob) {
    if (generatingImageCaseIds.includes(job.id)) {
      return;
    }

    if (blockIfCaseBudgetExceeded(job, "图片生成")) {
      return;
    }

    if (!hasGeneratedScriptStory(jobProcessRecords, job.id)) {
      const message = "请先生成脚本/分镜。图片生成只会读取已确认的分镜图片提示词，不会从空白 Case 重新编故事。";
      setGenerationError(message);
      appendCaseActivity(job.id, "error", "图片生成被阻止", message);
      return;
    }

    if (apiState !== "online") {
      const message = `API 服务当前为 ${apiState}。图片生成需要连接 ${apiBaseUrl}。`;
      setGenerationError(message);
      appendCaseActivity(job.id, "error", "图片生成被阻止", message);
      return;
    }

    setGenerationError(null);
    setGeneratingImageCaseIds((currentIds) => [...currentIds, job.id]);
    setJobs((currentJobs) =>
      currentJobs.map((currentJob) =>
        currentJob.id === job.id
          ? {
              ...currentJob,
              status: "IMAGE_GENERATING",
              updatedAt: new Date().toISOString()
            }
          : currentJob
      )
    );
    setJobProcessRecords((currentRecords) =>
      currentRecords.map((record) =>
        record.jobId === job.id && record.stageId === "image"
          ? {
              ...record,
              notes: "",
              output: "正在生成可审核的场景图片...",
              status: "working",
              updatedAt: new Date().toISOString()
            }
          : record
      )
    );

    try {
      const character = job.characterId ? characterProfiles.find((candidate) => candidate.id === job.characterId) ?? null : null;
      const result = await requestSequentialSceneImages(job, character, getGenerationReferencesForJob(job), getToolOverride("image"));
      const now = new Date().toISOString();

      setJobs((currentJobs) =>
        currentJobs.map((currentJob) =>
          currentJob.id === job.id
            ? {
                ...currentJob,
                actualCostRM: Number((currentJob.actualCostRM + result.costRM).toFixed(4)),
                reviewStatus: result.requiresReview ? "needs_review" : currentJob.reviewStatus,
                status: keepLaterStatus(job.status, result.status),
                updatedAt: now
              }
            : currentJob
        )
      );
      setJobProcessRecords((currentRecords) => applyImageGenerationResultToRecords(currentRecords, job.id, result, now));
      setSceneReviews((currentReviews) => [
        ...createSceneReviewItems(job.id, result.images, currentReviews),
        ...currentReviews.filter((review) => review.jobId !== job.id)
      ]);
      appendCaseActivity(
        job.id,
        result.requiresReview ? "error" : "stage_updated",
        result.requiresReview ? "图片 QC 需要人工审核" : "图片已生成",
        result.requiresReview
          ? `${result.provider} ${result.model} 已生成图片，但视觉 QC 阻止合成。请检查并重跑失败场景。`
          : `${result.provider} ${result.model} 已生成 ${result.images.length} 张可审核场景图片。成本 RM ${result.costRM.toFixed(4)}。`
      );
      setSelectedJobId(job.id);
    } catch (error) {
      const message = error instanceof Error ? error.message : "图片生成失败。";
      setGenerationError(message);
      setJobs((currentJobs) =>
        currentJobs.map((currentJob) =>
          currentJob.id === job.id
            ? {
                ...currentJob,
                status: "FAILED",
                updatedAt: new Date().toISOString()
              }
            : currentJob
        )
      );
      setJobProcessRecords((currentRecords) =>
        currentRecords.map((record) =>
          record.jobId === job.id && record.stageId === "image"
            ? {
                ...record,
                notes: message,
                output: message,
                status: "failed",
                updatedAt: new Date().toISOString()
              }
            : record
        )
      );
      appendCaseActivity(job.id, "error", "图片生成失败", message);
    } finally {
      setGeneratingImageCaseIds((currentIds) => currentIds.filter((id) => id !== job.id));
    }
  }

  async function handleGenerateSceneImage(job: AdminJob, scene: SceneReviewItem) {
    const operationId = `${job.id}_${scene.sceneId}`;

    if (generatingSceneImageIds.includes(operationId)) {
      return;
    }

    if (blockIfCaseBudgetExceeded(job, `场景 ${scene.sceneId} 图片重生`)) {
      return;
    }

    if (apiState !== "online") {
      const message = `API 服务当前为 ${apiState}。单场景图片生成需要连接 ${apiBaseUrl}。`;
      setGenerationError(message);
      appendCaseActivity(job.id, "error", "单场景图片生成被阻止", message);
      return;
    }

    setGenerationError(null);
    setGeneratingSceneImageIds((currentIds) => [...currentIds, operationId]);

    try {
      const character = job.characterId ? characterProfiles.find((candidate) => candidate.id === job.characterId) ?? null : null;
      const references = getGenerationReferencesForJob(job);
      const referenceBlocker = getReferenceGenerationBlocker(job, references);

      if (referenceBlocker) {
        throw new Error(referenceBlocker);
      }

      const result = await requestSceneImageGeneration(job, scene.sceneId, scene.prompt, character, references, getToolOverride("image"));
      const now = new Date().toISOString();
      const artifactPath = result.image.asset.publicUrl ?? result.image.asset.storagePath;
      const hasOtherBlockedScenes = sceneReviews.some((review) => review.jobId === job.id && review.id !== scene.id && (review.status === "needs_review" || review.status === "rejected"));

      setJobs((currentJobs) =>
        currentJobs.map((currentJob) =>
          currentJob.id === job.id
            ? {
                ...currentJob,
                actualCostRM: Number((currentJob.actualCostRM + result.costRM).toFixed(4)),
                reviewStatus: result.requiresReview ? "needs_review" : "draft",
                status: keepLaterStatus(currentJob.status, result.status),
                updatedAt: now
              }
            : currentJob
        )
      );
      setSceneReviews((currentReviews) =>
        currentReviews.map((review) =>
          review.id === scene.id
            ? {
                ...review,
                artifactPath,
                notes: result.image.qualityCheck?.summary ?? "",
                prompt: result.image.prompt,
                qcIssues: result.image.qualityCheck?.issues ?? [],
                qcStatus: result.image.qualityCheck?.status ?? "not_checked",
                qcSummary: result.image.qualityCheck?.summary ?? "",
                referenceImagePath: result.image.referenceImage?.publicUrl ?? result.image.referenceImage?.storagePath ?? review.referenceImagePath,
                status: result.image.qualityCheck?.status === "fail" ? "needs_review" : "generated",
                updatedAt: now
              }
            : review
        )
      );
      setJobProcessRecords((currentRecords) =>
        currentRecords.map((record) => {
          if (record.jobId !== job.id) {
            return record;
          }

          if (record.stageId === "image") {
            const artifacts = splitArtifactPaths(record.artifactPath);
            const nextArtifacts = replaceSceneArtifact(artifacts, scene.sceneId, artifactPath);

            return {
              ...record,
              artifactPath: nextArtifacts.join("\n"),
              costRM: Number((record.costRM + result.costRM).toFixed(4)),
              output: `${record.output}\n\n场景 ${scene.sceneId} 已重生: ${result.image.prompt}`,
              provider: result.provider === "openai" ? `OpenAI ${result.model}` : result.model,
              status: result.requiresReview || hasOtherBlockedScenes ? "failed" : "done",
              notes: result.requiresReview
                ? `场景 ${scene.sceneId} 未通过视觉 QC。请重生后再合成 MP4。`
                : hasOtherBlockedScenes
                  ? "还有其他场景图片需要审核，完成后才能合成 MP4。"
                  : "",
              updatedAt: now
            };
          }

          if (record.stageId === "compose" || record.stageId === "qc" || record.stageId === "archive") {
            return {
              ...record,
              artifactPath: "",
              output: `场景 ${scene.sceneId} 图片已更新，等待重新合成 MP4。`,
              status: "pending",
              updatedAt: now
            };
          }

          return record;
        })
      );
      setStoredVideos((currentVideos) => currentVideos.filter((currentVideo) => currentVideo.jobId !== job.id));
      setCaseQcReports((currentReports) => currentReports.filter((report) => report.jobId !== job.id));
      appendCaseActivity(job.id, "stage_updated", `场景 ${scene.sceneId} 图片已重生`, `${result.provider} ${result.model} 已重生一张场景图片。成本 RM ${result.costRM.toFixed(4)}。`);
    } catch (error) {
      const message = error instanceof Error ? error.message : `场景 ${scene.sceneId} 图片生成失败。`;
      setGenerationError(message);
      setSceneReviews((currentReviews) =>
        currentReviews.map((review) =>
          review.id === scene.id
            ? {
                ...review,
                notes: message,
                status: "rejected",
                updatedAt: new Date().toISOString()
              }
            : review
        )
      );
      appendCaseActivity(job.id, "error", `场景 ${scene.sceneId} 图片失败`, message);
    } finally {
      setGeneratingSceneImageIds((currentIds) => currentIds.filter((id) => id !== operationId));
    }
  }

  async function handleGenerateTts(job: AdminJob) {
    if (generatingTtsCaseIds.includes(job.id)) {
      return;
    }

    if (blockIfCaseBudgetExceeded(job, "配音生成")) {
      return;
    }

    if (!hasGeneratedScriptStory(jobProcessRecords, job.id)) {
      const message = "请先生成脚本/分镜。配音只会读取已确认的分镜旁白，不会从空白 Case 编旁白。";
      setGenerationError(message);
      appendCaseActivity(job.id, "error", "配音生成被阻止", message);
      return;
    }

    const voiceoverText = extractVoiceoverTextFromRecords(jobProcessRecords, job.id);

    if (!voiceoverText) {
      const message = "分镜或脚本阶段缺少旁白文本。请重新生成或编辑故事后再产出 TTS 音频。";
      setGenerationError(message);
      appendCaseActivity(job.id, "error", "配音生成被阻止", message);
      return;
    }

    if (apiState !== "online") {
      const message = `API 服务当前为 ${apiState}。配音生成需要连接 ${apiBaseUrl}。`;
      setGenerationError(message);
      appendCaseActivity(job.id, "error", "配音生成被阻止", message);
      return;
    }

    setGenerationError(null);
    setGeneratingTtsCaseIds((currentIds) => [...currentIds, job.id]);
    setJobs((currentJobs) =>
      currentJobs.map((currentJob) =>
        currentJob.id === job.id
          ? {
              ...currentJob,
              status: "TTS_GENERATING",
              updatedAt: new Date().toISOString()
            }
          : currentJob
      )
    );
    setJobProcessRecords((currentRecords) =>
      currentRecords.map((record) =>
        record.jobId === job.id && record.stageId === "tts"
          ? {
              ...record,
              notes: "",
              output: "正在根据分镜旁白生成 TTS 配音音频...",
              status: "working",
              updatedAt: new Date().toISOString()
            }
          : record
      )
    );

    try {
      const result = await requestTtsGeneration(job, voiceoverText, getToolOverride("tts"));
      const now = new Date().toISOString();

      setJobs((currentJobs) =>
        currentJobs.map((currentJob) =>
          currentJob.id === job.id
            ? {
                ...currentJob,
                actualCostRM: Number((currentJob.actualCostRM + result.costRM).toFixed(4)),
                reviewStatus: "draft",
                status: result.status,
                updatedAt: now
              }
            : currentJob
        )
      );
      setJobProcessRecords((currentRecords) => applyTtsGenerationResultToRecords(currentRecords, job.id, result, now));
      setStoredVideos((currentVideos) => currentVideos.filter((currentVideo) => currentVideo.jobId !== job.id));
      appendCaseActivity(job.id, "stage_updated", "配音已生成", `${result.provider} ${result.model} 已生成旁白音频。成本 RM ${result.costRM.toFixed(4)}。`);
      setSelectedJobId(job.id);
    } catch (error) {
      const message = error instanceof Error ? error.message : "配音生成失败。";
      setGenerationError(message);
      setJobs((currentJobs) =>
        currentJobs.map((currentJob) =>
          currentJob.id === job.id
            ? {
                ...currentJob,
                status: "FAILED",
                updatedAt: new Date().toISOString()
              }
            : currentJob
        )
      );
      setJobProcessRecords((currentRecords) =>
        currentRecords.map((record) =>
          record.jobId === job.id && record.stageId === "tts"
            ? {
                ...record,
                notes: message,
                output: message,
                status: "failed",
                updatedAt: new Date().toISOString()
              }
            : record
        )
      );
      appendCaseActivity(job.id, "error", "配音生成失败", message);
    } finally {
      setGeneratingTtsCaseIds((currentIds) => currentIds.filter((id) => id !== job.id));
    }
  }

  async function handleGenerateBgm(job: AdminJob) {
    if (generatingBgmCaseIds.includes(job.id)) {
      return;
    }

    if (blockIfCaseBudgetExceeded(job, "背景音乐生成")) {
      return;
    }

    if (apiState !== "online") {
      const message = `API 服务当前为 ${apiState}。背景音乐生成需要连接 ${apiBaseUrl}。`;
      setGenerationError(message);
      appendCaseActivity(job.id, "error", "BGM 生成被阻止", message);
      return;
    }

    setGenerationError(null);
    setGeneratingBgmCaseIds((currentIds) => [...currentIds, job.id]);
    setJobs((currentJobs) =>
      currentJobs.map((currentJob) =>
        currentJob.id === job.id
          ? {
              ...currentJob,
              status: "BGM_GENERATING",
              updatedAt: new Date().toISOString()
            }
          : currentJob
      )
    );
    setJobProcessRecords((currentRecords) =>
      currentRecords.map((record) =>
        record.jobId === job.id && record.stageId === "bgm"
          ? {
              ...record,
              notes: "",
              output: "正在使用 ElevenLabs Music 生成无歌词背景音乐...",
              status: "working",
              updatedAt: new Date().toISOString()
            }
          : record
      )
    );

    try {
      const result = await requestBgmGeneration(job, getToolOverride("bgm"));
      const now = new Date().toISOString();

      setJobs((currentJobs) =>
        currentJobs.map((currentJob) =>
          currentJob.id === job.id
            ? {
                ...currentJob,
                actualCostRM: Number((currentJob.actualCostRM + result.costRM).toFixed(4)),
                reviewStatus: "draft",
                status: result.status,
                updatedAt: now
              }
            : currentJob
        )
      );
      setJobProcessRecords((currentRecords) => applyBgmGenerationResultToRecords(currentRecords, job.id, result, now));
      setStoredVideos((currentVideos) => currentVideos.filter((currentVideo) => currentVideo.jobId !== job.id));
      appendCaseActivity(job.id, "stage_updated", "背景音乐已生成", `${result.provider} ${result.model} 已生成无歌词 BGM。成本 RM ${result.costRM.toFixed(4)}。`);
      setSelectedJobId(job.id);
    } catch (error) {
      const message = error instanceof Error ? error.message : "背景音乐生成失败。";
      setGenerationError(message);
      setJobs((currentJobs) =>
        currentJobs.map((currentJob) =>
          currentJob.id === job.id
            ? {
                ...currentJob,
                status: "FAILED",
                updatedAt: new Date().toISOString()
              }
            : currentJob
        )
      );
      setJobProcessRecords((currentRecords) =>
        currentRecords.map((record) =>
          record.jobId === job.id && record.stageId === "bgm"
            ? {
                ...record,
                notes: message,
                output: message,
                status: "failed",
                updatedAt: new Date().toISOString()
              }
            : record
        )
      );
      appendCaseActivity(job.id, "error", "BGM 生成失败", message);
    } finally {
      setGeneratingBgmCaseIds((currentIds) => currentIds.filter((id) => id !== job.id));
    }
  }

  async function generateSeedanceSceneClipsForJob(job: AdminJob, recordsSnapshot: JobProcessRecord[]): Promise<GenerateVideoClipResponse[]> {
    const clipInputs = getSeedanceClipInputs(recordsSnapshot, sceneReviews, productionAssets, job);

    if (clipInputs.length === 0) {
      throw new Error("找不到可用于 Seedance 的分镜场景。请先重新生成或确认脚本/分镜。");
    }

    const results: GenerateVideoClipResponse[] = [];

    for (const [index, clipInput] of clipInputs.entries()) {
      setJobProcessRecords((currentRecords) =>
        currentRecords.map((record) =>
          record.jobId === job.id && record.stageId === "video"
            ? {
                ...record,
                output: `正在生成 Seedance 场景片段 ${index + 1}/${clipInputs.length}：场景 ${clipInput.sceneId}，${clipInput.durationSeconds}s...`,
                status: "working",
                updatedAt: new Date().toISOString()
              }
            : record
        )
      );

      const result = await requestVideoClipGeneration(job, {
        durationSeconds: clipInput.durationSeconds,
        imageUrl: clipInput.imageUrl,
        lastFrameImageUrl: clipInput.lastFrameImageUrl,
        prompt: clipInput.prompt,
        referenceImageUrls: clipInput.referenceImageUrls,
        sceneId: clipInput.sceneId
      }, getToolOverride("video"));

      results.push(result);
    }

    return results;
  }

  function getGeneratedClipCount(records: JobProcessRecord[], jobId: string): number {
    const videoRecord = records.find((record) => record.jobId === jobId && record.stageId === "video");

    return splitArtifactPaths(videoRecord?.artifactPath).filter((artifact) => /\.(mp4|mov|webm)(\?|$)/iu.test(artifact)).length;
  }

  async function handleGenerateVideoClip(job: AdminJob) {
    if (generatingVideoClipCaseIds.includes(job.id)) {
      return;
    }

    if (blockIfCaseBudgetExceeded(job, "Seedance 视频片段生成")) {
      return;
    }

    if (!hasGeneratedScriptStory(jobProcessRecords, job.id)) {
      const message = "请先生成脚本/分镜。Seedance 需要已确认的场景提示词才能生成动态片段。";
      setGenerationError(message);
      appendCaseActivity(job.id, "error", "Seedance 视频片段被阻止", message);
      return;
    }

    if (apiState !== "online") {
      const message = `API 服务当前为 ${apiState}。Seedance 视频片段生成需要连接 ${apiBaseUrl}。`;
      setGenerationError(message);
      appendCaseActivity(job.id, "error", "Seedance 视频片段被阻止", message);
      return;
    }

    setGenerationError(null);
    setGeneratingVideoClipCaseIds((currentIds) => [...currentIds, job.id]);
    setJobs((currentJobs) =>
      currentJobs.map((currentJob) =>
        currentJob.id === job.id
          ? {
              ...currentJob,
              status: "VIDEO_GENERATING",
              updatedAt: new Date().toISOString()
            }
          : currentJob
      )
    );
    setJobProcessRecords((currentRecords) =>
      currentRecords.map((record) =>
        record.jobId === job.id && record.stageId === "video"
          ? {
              ...record,
              notes: "",
              output: "正在准备分镜场景，准备交给 Seedance 2.0 生成视频片段...",
              status: "working",
              updatedAt: new Date().toISOString()
            }
          : record
      )
    );

    const successfulResults: GenerateVideoClipResponse[] = [];

    try {
      successfulResults.push(...await generateSeedanceSceneClipsForJob(job, jobProcessRecords));

      const now = new Date().toISOString();
      const totalCostRM = successfulResults.reduce((sum, result) => sum + result.costRM, 0);

      setJobs((currentJobs) =>
        currentJobs.map((currentJob) =>
          currentJob.id === job.id
            ? {
                ...currentJob,
                actualCostRM: Number((currentJob.actualCostRM + totalCostRM).toFixed(4)),
                reviewStatus: "draft",
                status: keepLaterStatus(currentJob.status, "VIDEO_DONE"),
                updatedAt: now
              }
            : currentJob
        )
      );
      setJobProcessRecords((currentRecords) => applyVideoClipGenerationResultsToRecords(currentRecords, job.id, successfulResults, now));
      appendCaseActivity(
        job.id,
        "stage_updated",
        "Seedance 视频片段已生成",
        `${successfulResults[0]?.model ?? "Seedance 2.0"} 已根据分镜生成 ${successfulResults.length} 个场景片段。总成本 RM ${totalCostRM.toFixed(4)}。`
      );
      setSelectedJobId(job.id);
    } catch (error) {
      const message = error instanceof Error ? error.message : "Seedance 视频片段生成失败。";
      setGenerationError(message);
      setJobs((currentJobs) =>
        currentJobs.map((currentJob) =>
          currentJob.id === job.id
            ? {
                ...currentJob,
                updatedAt: new Date().toISOString()
              }
            : currentJob
        )
      );
      setJobProcessRecords((currentRecords) =>
        successfulResults.length > 0
          ? applyVideoClipGenerationResultsToRecords(currentRecords, job.id, successfulResults, new Date().toISOString(), "failed", message)
          : currentRecords.map((record) =>
              record.jobId === job.id && record.stageId === "video"
                ? {
                    ...record,
                    notes: message,
                    output: message,
                    status: "failed",
                    updatedAt: new Date().toISOString()
                  }
                : record
            )
      );
      appendCaseActivity(job.id, "error", "Seedance 视频片段失败", message);
    } finally {
      setGeneratingVideoClipCaseIds((currentIds) => currentIds.filter((id) => id !== job.id));
    }
  }

  async function handleGenerateVideo(job: AdminJob) {
    if (generatingCaseIds.includes(job.id)) {
      return;
    }

    if (blockIfCaseBudgetExceeded(job, "最终 MP4 生成")) {
      return;
    }

    if (!hasGeneratedRasterImages(jobProcessRecords, job.id)) {
      const message = "请先生成并审核场景图片。影片合成会使用这些 PNG/JPG 图片，因此必须等图片阶段有真实可审核资产后才能继续。";
      setGenerationError(message);
      appendCaseActivity(job.id, "error", "影片生成被阻止", message);
      return;
    }

    if (hasBlockedSceneReviews(sceneReviews, job.id)) {
      const message = "场景图片 QC 仍在阻止这个 Case。请重生或批准失败场景图后再合成 MP4。";
      setGenerationError(message);
      appendCaseActivity(job.id, "error", "影片生成被阻止", message);
      return;
    }

    if (apiState !== "online") {
      const message = `API 服务当前为 ${apiState}。影片生成需要连接 ${apiBaseUrl}。`;
      setGenerationError(message);
      appendCaseActivity(job.id, "error", "影片生成被阻止", message);
      return;
    }

    setGenerationError(null);
    setGeneratingCaseIds((currentIds) => [...currentIds, job.id]);
    setJobs((currentJobs) =>
      currentJobs.map((currentJob) =>
        currentJob.id === job.id
          ? {
              ...currentJob,
              status: "COMPOSING",
              updatedAt: new Date().toISOString()
            }
          : currentJob
      )
    );
    setJobProcessRecords((currentRecords) =>
      currentRecords.map((record) =>
          record.jobId === job.id && record.stageId === "compose"
            ? {
                ...record,
                notes: "",
                output: "正在补齐缺少的配音/场景片段，然后渲染带字幕 MP4...",
                status: "working",
                updatedAt: new Date().toISOString()
            }
          : record
      )
    );

    try {
      let workingRecords = jobProcessRecords;
      let pipelineCostRM = 0;

      if (!hasGeneratedVoiceoverAudio(workingRecords, job.id)) {
        const voiceoverText = extractVoiceoverTextFromRecords(workingRecords, job.id);

        if (!voiceoverText) {
          throw new Error("分镜或脚本阶段缺少旁白文本。请重新生成或编辑故事后再产出 TTS 音频。");
        }

        setJobProcessRecords((currentRecords) =>
          currentRecords.map((record) =>
            record.jobId === job.id && record.stageId === "tts"
              ? {
                  ...record,
                  output: "合成 MP4 前，正在自动生成已配置的 TTS 配音...",
                  status: "working",
                  updatedAt: new Date().toISOString()
                }
              : record
          )
        );
        const ttsResult = await requestTtsGeneration(job, voiceoverText, getToolOverride("tts"));
        const ttsNow = new Date().toISOString();
        pipelineCostRM += ttsResult.costRM;
        workingRecords = applyTtsGenerationResultToRecords(workingRecords, job.id, ttsResult, ttsNow);
        setJobProcessRecords((currentRecords) => applyTtsGenerationResultToRecords(currentRecords, job.id, ttsResult, ttsNow));
        appendCaseActivity(job.id, "stage_updated", "配音已生成", `${ttsResult.provider} ${ttsResult.model} 已在合成 MP4 前自动生成旁白。成本 RM ${ttsResult.costRM.toFixed(4)}。`);
      }

      const expectedClipCount = getSeedanceClipInputs(workingRecords, sceneReviews, productionAssets, job).length;
      const currentClipCount = getGeneratedClipCount(workingRecords, job.id);

      if (expectedClipCount > 0 && currentClipCount < expectedClipCount) {
        const clipResults = await generateSeedanceSceneClipsForJob(job, workingRecords);
        const clipNow = new Date().toISOString();
        const clipCostRM = clipResults.reduce((sum, result) => sum + result.costRM, 0);
        pipelineCostRM += clipCostRM;
        workingRecords = applyVideoClipGenerationResultsToRecords(workingRecords, job.id, clipResults, clipNow);
        setJobProcessRecords((currentRecords) => applyVideoClipGenerationResultsToRecords(currentRecords, job.id, clipResults, clipNow));
        appendCaseActivity(job.id, "stage_updated", "Seedance 视频片段已生成", `${clipResults[0]?.model ?? "Seedance 2.0"} 已在合成 MP4 前自动生成 ${clipResults.length} 个场景片段。成本 RM ${clipCostRM.toFixed(4)}。`);
      }

      setJobProcessRecords((currentRecords) =>
        currentRecords.map((record) =>
          record.jobId === job.id && record.stageId === "compose"
            ? {
                ...record,
                output: "正在用场景片段/图片、同步配音、可用 BGM 和烧录字幕渲染 MP4...",
                status: "working",
                updatedAt: new Date().toISOString()
              }
            : record
        )
      );
      const result = await requestVideoGeneration(job, getToolOverride("compose"));
      const now = new Date().toISOString();
      const hasUploadTargets = casePublishTargets.some((target) => target.jobId === job.id);

      setJobs((currentJobs) =>
        currentJobs.map((currentJob) =>
          currentJob.id === job.id
            ? {
                ...currentJob,
                actualCostRM: Number((currentJob.actualCostRM + pipelineCostRM + result.costRM).toFixed(4)),
                durationSeconds: result.durationSeconds,
                reviewStatus: "needs_review",
                status: hasUploadTargets ? "READY_TO_UPLOAD" : "QC_PASSED",
                updatedAt: now
              }
            : currentJob
        )
      );
      setJobProcessRecords((currentRecords) => applyGenerationResultToRecords(currentRecords, job.id, result, now, hasUploadTargets));
      setStoredVideos((currentVideos) => {
        const video = createStoredVideoFromGeneration(job, result);
        return [video, ...currentVideos.filter((currentVideo) => currentVideo.jobId !== job.id)];
      });
      appendCaseActivity(
        job.id,
        "video_generated",
        "影片已生成",
        hasUploadTargets
          ? `最终 MP4 已生成：${result.artifacts.finalVideo.publicUrl ?? result.artifacts.finalVideo.storagePath}。等待私密上传审核。`
          : `最终 MP4 已生成：${result.artifacts.finalVideo.publicUrl ?? result.artifacts.finalVideo.storagePath}。未配置 YouTube 目标，所以这个 Case 会停在 MP4/QC。`
      );
      setSelectedJobId(job.id);
      void handleRunQc({
        ...job,
        actualCostRM: Number((job.actualCostRM + pipelineCostRM + result.costRM).toFixed(4)),
        durationSeconds: result.durationSeconds,
        status: hasUploadTargets ? "READY_TO_UPLOAD" : "QC_PASSED"
      }, {
        finalVideo: result.artifacts.finalVideo.publicUrl ?? result.artifacts.finalVideo.storagePath,
        sceneImages: result.artifacts.sceneImages.map((image) => image.publicUrl ?? image.storagePath),
        subtitles: result.artifacts.subtitles.publicUrl ?? result.artifacts.subtitles.storagePath,
        voiceover: result.artifacts.voiceover.publicUrl ?? result.artifacts.voiceover.storagePath
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : "影片生成失败。";
      setGenerationError(message);
      setJobs((currentJobs) =>
        currentJobs.map((currentJob) =>
          currentJob.id === job.id
            ? {
                ...currentJob,
                status: "FAILED",
                updatedAt: new Date().toISOString()
              }
            : currentJob
        )
      );
      setJobProcessRecords((currentRecords) =>
        currentRecords.map((record) =>
          record.jobId === job.id && record.stageId === "compose"
            ? {
                ...record,
                notes: message,
                output: message,
                status: "failed",
                updatedAt: new Date().toISOString()
              }
            : record
        )
      );
      appendCaseActivity(job.id, "error", "影片生成失败", message);
    } finally {
      setGeneratingCaseIds((currentIds) => currentIds.filter((id) => id !== job.id));
    }
  }

  async function handleRunQc(job: AdminJob, artifactsOverride?: ReturnType<typeof collectQcArtifacts>) {
    if (generatingQcCaseIds.includes(job.id)) {
      return;
    }

    if (apiState !== "online") {
      const message = `API 服务当前为 ${apiState}。QC 检查需要连接 ${apiBaseUrl}。`;
      setGenerationError(message);
      appendCaseActivity(job.id, "error", "QC 被阻止", message);
      return;
    }

    setGenerationError(null);
    setGeneratingQcCaseIds((currentIds) => [...currentIds, job.id]);
    setJobProcessRecords((currentRecords) =>
      currentRecords.map((record) =>
        record.jobId === job.id && record.stageId === "qc"
          ? {
              ...record,
              output: "正在检查媒体、资产、音频、字幕和预算...",
              status: "working",
              updatedAt: new Date().toISOString()
            }
          : record
      )
    );

    try {
      const report = await requestQcReport(job, artifactsOverride ?? collectQcArtifacts(jobProcessRecords, job.id));
      const now = new Date().toISOString();
      const storedReport = createCaseQcReport(report);

      setCaseQcReports((currentReports) => [storedReport, ...currentReports.filter((currentReport) => currentReport.jobId !== job.id)]);
      setJobs((currentJobs) =>
        currentJobs.map((currentJob) =>
          currentJob.id === job.id
            ? {
                ...currentJob,
                status: report.passed ? keepLaterStatus(currentJob.status, "QC_PASSED") : "FAILED",
                updatedAt: now
              }
            : currentJob
        )
      );
      setJobProcessRecords((currentRecords) =>
        currentRecords.map((record) =>
          record.jobId === job.id && record.stageId === "qc"
            ? {
                ...record,
                artifactPath: firstArtifactPath(artifactsOverride?.finalVideo ?? collectQcArtifacts(currentRecords, job.id).finalVideo) ?? record.artifactPath,
                notes: report.passed ? "" : report.summary,
                output: formatQcReport(report),
                status: report.passed ? "done" : "failed",
                updatedAt: now
              }
            : record
        )
      );
      appendCaseActivity(job.id, report.passed ? "stage_updated" : "error", report.passed ? "QC 通过" : "QC 失败", report.summary);
    } catch (error) {
      const message = error instanceof Error ? error.message : "QC 报告生成失败。";
      setGenerationError(message);
      setJobProcessRecords((currentRecords) =>
        currentRecords.map((record) =>
          record.jobId === job.id && record.stageId === "qc"
            ? {
                ...record,
                notes: message,
                output: message,
                status: "failed",
                updatedAt: new Date().toISOString()
              }
            : record
        )
      );
      appendCaseActivity(job.id, "error", "QC 失败", message);
    } finally {
      setGeneratingQcCaseIds((currentIds) => currentIds.filter((id) => id !== job.id));
    }
  }

  function handleConnectAccount(input: { channelName: string; youtubeChannelId: string }) {
    const normalizedName = input.channelName.trim();
    const normalizedChannelId = input.youtubeChannelId.trim();

    if (!normalizedName || !normalizedChannelId) {
      return;
    }

    const account = createYouTubeAccount(normalizedName, normalizedChannelId);
    setAccounts((currentAccounts) => [account, ...currentAccounts.filter((currentAccount) => currentAccount.youtubeChannelId !== normalizedChannelId)]);
  }

  function updateAccount(id: string, updater: (account: YouTubeAccount) => YouTubeAccount) {
    setAccounts((currentAccounts) => currentAccounts.map((account) => (account.id === id ? updater(account) : account)));
  }

  function handleCreatePublishingTarget(input: { accountId: string; channelName: string; youtubeChannelId: string }) {
    const account = accounts.find((candidate) => candidate.id === input.accountId) ?? accounts[0];
    const normalizedChannelName = input.channelName.trim() || account?.channelName || "Untitled Channel";
    const normalizedChannelId = input.youtubeChannelId.trim() || account?.youtubeChannelId || "UC_missing";

    if (!account) {
      return;
    }

    setPublishingTargets((currentTargets) => [
      createPublishingTarget({
        accountId: account.id,
        channelName: normalizedChannelName,
        youtubeChannelId: normalizedChannelId
      }),
      ...currentTargets
    ]);
  }

  function updatePublishingTarget(id: string, updater: (target: PublishingTarget) => PublishingTarget) {
    setPublishingTargets((currentTargets) =>
      currentTargets.map((target) =>
        target.id === id
          ? {
              ...updater(target),
              defaultPrivacy: "private",
              updatedAt: new Date().toISOString()
            }
          : target
      )
    );
  }

  function updateProductionSchedule(id: string, updater: (schedule: ProductionSchedule) => ProductionSchedule) {
    setProductionSchedules((currentSchedules) =>
      currentSchedules.map((schedule) => {
        if (schedule.id !== id) {
          return schedule;
        }

        const updatedSchedule = updater(schedule);
        return {
          ...updatedSchedule,
          approvalGate: "mp4_review",
          nextRunAt: calculateNextRunAt(updatedSchedule)
        };
      })
    );
  }

  function approveCaseForPublishing(job: AdminJob) {
    const selectableTargets = casePublishTargets.filter((target) => target.jobId === job.id);

    if (!["READY_TO_UPLOAD", "QC_PASSED", "COMPOSED"].includes(job.status)) {
      return;
    }

    const now = new Date().toISOString();

    if (selectableTargets.length === 0) {
      setJobs((currentJobs) =>
        currentJobs.map((currentJob) =>
          currentJob.id === job.id
            ? {
                ...currentJob,
                reviewStatus: "approved",
                status: "QC_PASSED",
                updatedAt: now
              }
            : currentJob
        )
      );
      setJobProcessRecords((currentRecords) =>
        currentRecords.map((record) =>
          record.jobId === job.id && record.stageId === "publish"
            ? {
                ...record,
                output: "未配置 YouTube 目标。MP4 已在本地审核通过，上传阶段保持跳过。",
                status: "skipped",
                updatedAt: now
              }
            : record
        )
      );
      appendCaseActivity(job.id, "case_approved", "MP4 已审核通过", "人工审核已批准这个 MP4。当前未配置 YouTube 目标，所以生产会停在 MP4/QC 完成状态。");
      return;
    }

    setJobs((currentJobs) =>
      currentJobs.map((currentJob) =>
        currentJob.id === job.id
          ? {
              ...currentJob,
              reviewStatus: "approved",
              status: "READY_TO_UPLOAD",
              updatedAt: now
            }
          : currentJob
      )
    );
    setCasePublishTargets((currentTargets) =>
      currentTargets.map((target) =>
        target.jobId === job.id
          ? {
              ...target,
              approvedAt: now,
              error: null,
              status: "approved",
              updatedAt: now
            }
          : target
      )
    );
    appendCaseActivity(job.id, "case_approved", "MP4 已审核通过", "人工审核已批准这个 MP4，可继续执行已绑定目标的私密上传。");
  }

  function uploadPrivateTarget(job: AdminJob, targetId: string) {
    const publishTarget = casePublishTargets.find((target) => target.jobId === job.id && target.targetId === targetId);

    if (!publishTarget || publishTarget.status !== "approved" || job.reviewStatus !== "approved") {
      return;
    }

    const now = new Date().toISOString();
    const message = "YouTube upload is not connected yet. Configure real YouTube OAuth credentials and provider execution before uploading; no mock YouTube video ID was created.";
    setCasePublishTargets((currentTargets) =>
      currentTargets.map((target) =>
        target.id === publishTarget.id
          ? {
              ...target,
              error: message,
              privacyStatus: "private",
              retryCount: target.retryCount + 1,
              status: "failed",
              updatedAt: now,
              uploadedAt: null,
              youtubeVideoId: null
            }
          : target
      )
    );
    setGenerationError(message);
    appendCaseActivity(job.id, "error", "Private upload blocked", message);
  }

  function updateStoredVideo(id: string, updater: (video: StoredVideo) => StoredVideo) {
    setStoredVideos((currentVideos) => currentVideos.map((video) => (video.id === id ? updater(video) : video)));
  }

  function updateProviderKey(id: string, updater: (key: ProviderKeyRecord) => ProviderKeyRecord) {
    setProviderKeys((currentKeys) => currentKeys.map((key) => (key.id === id ? updater(key) : key)));
  }

  async function saveProviderSecret(id: string) {
    const secret = secretDrafts[id] ?? "";
    const key = providerKeys.find((candidate) => candidate.id === id);

    if (!key || !secret.trim()) {
      return;
    }

    try {
      const saved = await saveProviderSecretToApi(key.keyName, secret);
      setProviderKeys((currentKeys) =>
        applyProviderSecret(currentKeys, id, secret).map((candidate) =>
          candidate.id === id
            ? {
                ...candidate,
                lastFour: saved.lastFour ?? candidate.lastFour,
                status: saved.configured ? "configured" : candidate.status
              }
            : candidate
        )
      );
      setGenerationError(null);
    } catch (error) {
      setGenerationError(error instanceof Error ? error.message : "Provider key save failed.");
      return;
    }
    setSecretDrafts((currentDrafts) => ({
      ...currentDrafts,
      [id]: ""
    }));
    setVisibleDrafts((currentVisibleDrafts) => ({
      ...currentVisibleDrafts,
      [id]: false
    }));
  }

  const selectedJob = jobs.find((job) => job.id === selectedJobId) ?? jobs[0] ?? null;
  const selectedJobRecords = selectedJob ? jobProcessRecords.filter((record) => record.jobId === selectedJob.id).sort((a, b) => a.order - b.order) : [];
  const selectedJobActivities = selectedJob ? caseActivities.filter((activity) => activity.jobId === selectedJob.id) : [];
  const selectedJobPublishTargets = selectedJob ? casePublishTargets.filter((target) => target.jobId === selectedJob.id) : [];
  const selectedJobSceneReviews = selectedJob ? sceneReviews.filter((review) => review.jobId === selectedJob.id).sort((a, b) => a.sceneId - b.sceneId) : [];
  const selectedJobSeries = selectedJob?.seriesId ? contentSeries.find((series) => series._id === selectedJob.seriesId) ?? null : null;
  const selectedJobProductionAssets = selectedJob
    ? getProductionAssetsForCase({
        ...selectedJob,
        referenceAssetIds: selectedJobSeries?.referenceAssetIds ?? []
      }, productionAssets)
    : [];
  const selectedJobQcReport = selectedJob ? caseQcReports.find((report) => report.jobId === selectedJob.id) ?? null : null;
  const selectedCharacter = selectedJob?.characterId ? characterProfiles.find((character) => character.id === selectedJob.characterId) ?? null : null;
  const canUpload = accounts.some((account) => account.status === "connected");
  const openAiKey = providerKeys.find((key) => key.keyName === "OPENAI_API_KEY");
  const gcpStorageKey = providerKeys.find((key) => key.keyName === "GOOGLE_APPLICATION_CREDENTIALS");
  const storageIsLocalFallback = storageSettings.driver === "local" || gcpStorageKey?.status !== "configured";

  const summary = useMemo(() => {
    const failedJobIds = new Set(jobProcessRecords.filter((record) => record.status === "failed").map((record) => record.jobId));

    return {
      activeCases: jobs.filter((job) => !["COMPLETED", "FAILED"].includes(job.status)).length,
      readyCases: jobs.filter((job) => job.status === "QC_PASSED" || job.status === "READY_TO_UPLOAD").length,
      blockedCases: jobs.filter((job) => job.status === "FAILED" || failedJobIds.has(job.id)).length,
      reviewCases: jobs.filter((job) => job.status === "QC_PASSED" || job.status === "READY_TO_UPLOAD").length,
      nextRunAt: productionSchedules.filter((schedule) => schedule.enabled).sort((a, b) => new Date(a.nextRunAt).getTime() - new Date(b.nextRunAt).getTime())[0]?.nextRunAt ?? null,
      scheduledToday: jobs.filter((job) => job.source === "scheduled" && isSameLocalDay(job.createdAt)).length,
      totalCost: jobs.reduce((sum, job) => sum + job.actualCostRM, 0),
      privateUploads: jobs.filter((job) => job.status === "UPLOADED_PRIVATE" || job.status === "COMPLETED").length
    };
  }, [jobProcessRecords, jobs, productionSchedules]);

  return (
    <main className="app-shell">
      <aside className="sidebar">
        <div className="brand">
          <FileVideo size={20} />
          <div>
            <strong>AI Content Factory</strong>
            <span>短视频内容运营</span>
          </div>
        </div>

        <nav className="nav-list" aria-label="后台导航">
          <NavButton active={activeView === "dashboard"} icon={<LayoutDashboard size={17} />} label="控制台" onClick={() => switchView("dashboard")} />
          <NavButton active={activeView === "automation"} icon={<CalendarClock size={17} />} label="自动排程" onClick={() => switchView("automation")} />
          <NavButton active={activeView === "trends"} icon={<Search size={17} />} label="趋势" onClick={() => switchView("trends")} />
          <NavButton active={activeView === "series"} icon={<BookOpen size={17} />} label="系列题库" onClick={() => switchView("series")} />
          <NavButton active={activeView === "cases"} icon={<Activity size={17} />} label="影片 Case" onClick={() => switchView("cases")} />
          <NavButton active={activeView === "assets"} icon={<Database size={17} />} label="设计资产" onClick={() => switchView("assets")} />
          <NavButton active={activeView === "agents"} icon={<Bot size={17} />} label="主控 Agent" onClick={() => switchView("agents")} />
          <NavButton active={activeView === "workflow"} icon={<Workflow size={17} />} label="流程" onClick={() => switchView("workflow")} />
          <NavButton active={activeView === "keys"} icon={<KeyRound size={17} />} label="密钥" onClick={() => switchView("keys")} />
          <NavButton active={activeView === "youtube"} icon={<Link2 size={17} />} label="YouTube" onClick={() => switchView("youtube")} />
          <NavButton active={activeView === "storage"} icon={<Database size={17} />} label="存储" onClick={() => switchView("storage")} />
          <NavButton active={activeView === "cost"} icon={<CircleDollarSign size={17} />} label="成本" onClick={() => switchView("cost")} />
        </nav>

        <div className="sidebar-lock">
          <ShieldCheck size={18} />
          <div>
            <strong>私密上传锁定</strong>
            <span>MVP 禁止公开发布</span>
          </div>
        </div>
      </aside>

      <section className="workspace">
        <header className="topbar">
          <div>
            <p className="eyebrow">{viewTitles[activeView].eyebrow}</p>
            <h1>{viewTitles[activeView].title}</h1>
          </div>
          <div className="topbar-status-group">
            {hasUnsavedDrafts ? (
              <div className="unsaved-draft-badge" title="当前有业务资料草稿尚未保存；保存或取消后再切换页面更安全。">
                <FilePenLine size={16} />
                <span>未保存修改</span>
                <strong>{dirtyDraftCount}</strong>
              </div>
            ) : null}
            <StatusButton
              state={apiState}
              label={apiState === "online" ? `API ${formatApiEnvironmentLabel(health?.env)}` : apiState === "offline" ? "API 离线" : "检查 API"}
              onClick={() => void refreshOperationalStatus()}
            />
            <StatusButton
              state={databaseState}
              label={databaseState === "online" ? `Mongo ${databaseStatus?.databaseName ?? "online"}` : databaseState === "offline" ? "Mongo 离线" : "检查 Mongo"}
              onClick={() => void refreshOperationalStatus()}
            />
            <StatusButton
              state={openAiKey?.status === "configured" ? "online" : "offline"}
              label={openAiKey?.status === "configured" ? `OpenAI ${openAiKey.lastFour ? `...${openAiKey.lastFour}` : "已配置"}` : "OpenAI Key 缺失"}
              onClick={() => switchView("keys")}
            />
            <StatusButton
              state={storageIsLocalFallback ? "warning" : "online"}
              label={storageIsLocalFallback ? "本地存储 uploads/" : "GCS 存储"}
              onClick={() => switchView("storage")}
            />
          </div>
        </header>

        {activeView === "dashboard" ? (
          <DashboardPage
            accounts={accounts}
            agents={staffAgents}
            casePublishTargets={casePublishTargets}
            jobs={jobs}
            publishingTargets={publishingTargets}
            records={jobProcessRecords}
            schedules={productionSchedules}
            storedVideos={storedVideos}
            summary={summary}
            onNavigate={switchView}
            onOpenCase={(id) => {
              setSelectedJobId(id);
              switchView("cases");
            }}
          />
        ) : null}

        {activeView === "automation" ? (
          <AutomationPage
            budgetSettings={budgetSettings}
            endpoints={aiToolEndpoints}
            jobs={jobs}
            producerAgent={staffAgents[0] ?? null}
            providerKeys={providerKeys}
            publishingTargets={publishingTargets}
            reportDirtyState={reportDirtyDraft}
            runSchedule={(scheduleId) => void runProductionSchedule(scheduleId, "manual")}
            runs={scheduleRuns}
            schedules={productionSchedules}
            settings={toolProviderSettings}
            updateSchedule={updateProductionSchedule}
          />
        ) : null}

        {activeView === "trends" ? (
          <TrendRadarPage
            applyAiNichePreset={applyAiNicheTrendPreset}
            categoryId={trendCategoryId}
            clearReports={() => setTrendReports([])}
            currentReport={trendReports[0] ?? null}
            excludeKeywords={trendExcludeKeywords}
            includeKeywords={trendIncludeKeywords}
            isScanning={isScanningTrends}
            language={trendLanguage}
            languageMode={trendLanguageMode}
            maxResults={trendMaxResults}
            minVelocityScore={trendMinVelocityScore}
            minViews={trendMinViews}
            publishedWithinDays={trendPublishedWithinDays}
            query={trendQuery}
            regionCode={trendRegionCode}
            reports={trendReports}
            runTrendScan={() => void handleTrendScan()}
            safeMode={trendSafeMode}
            scanError={trendScanError}
            setCategoryId={setTrendCategoryId}
            setExcludeKeywords={setTrendExcludeKeywords}
            setIncludeKeywords={setTrendIncludeKeywords}
            setLanguage={setTrendLanguage}
            setLanguageMode={setTrendLanguageMode}
            setMaxResults={setTrendMaxResults}
            setMinVelocityScore={setTrendMinVelocityScore}
            setMinViews={setTrendMinViews}
            setPublishedWithinDays={setTrendPublishedWithinDays}
            setQuery={setTrendQuery}
            setRegionCode={setTrendRegionCode}
            setSafeMode={setTrendSafeMode}
            useIdeaSeed={useTrendIdeaSeed}
          />
        ) : null}

        {activeView === "series" ? (
          <SeriesPage
            assets={productionAssets}
            convertEpisodeToCase={(series, episode) => void handleConvertSeriesEpisodeToCase(series, episode)}
            createSeries={() => void handleCreateSeries()}
            createStoryWorld={(input) => handleCreateStoryWorld(input)}
            deleteSeries={(id) => void handleDeleteSeries(id)}
            episodes={seriesEpisodes}
            error={seriesError}
            generateIdeas={(seriesId, count) => void handleGenerateSeriesIdeas(seriesId, count)}
            generatingSeriesIds={generatingSeriesIdeaIds}
            isLoading={isLoadingSeries}
            jobs={jobs}
            openCase={(id) => {
              setSelectedJobId(id);
              switchView("cases");
            }}
            reportDirtyState={reportDirtyDraft}
            refresh={() => void refreshSeries()}
            selectSeries={selectSeries}
            selectedSeriesId={selectedSeriesId}
            series={contentSeries}
            storyWorlds={storyWorlds}
            deleteEpisode={(seriesId, episodeId) => void handleDeleteSeriesEpisode(seriesId, episodeId)}
            updateEpisode={(seriesId, episodeId, patch) => handleUpdateSeriesEpisode(seriesId, episodeId, patch)}
            updateSeries={(id, patch) => handleUpdateSeries(id, patch)}
          />
        ) : null}

        {activeView === "cases" ? (
          <CasesPage
            addVideoForJob={addVideoForJob}
            agents={staffAgents}
            autoGenerateCase={() => void handleAutoGenerateCase()}
            autoGenerateStep={autoGenerateStep}
            clearCases={() => {
              setJobs([]);
              setJobProcessRecords([]);
              setCaseActivities([]);
              setCasePublishTargets([]);
              setSceneReviews([]);
              setCaseReferenceAssets([]);
              setProductionAssets([]);
              setCaseQcReports([]);
              setSelectedJobId(null);
            }}
            costLimitRM={costLimitRM}
            characters={characterProfiles}
            draftBackgroundAssetId={selectedBackgroundAssetId}
            draftCharacterAssetIds={selectedCharacterAssetIds}
            draftCharacterId={selectedCharacterId}
            draftCharacterAssetId={selectedCharacterAssetId}
            draftSceneAssetIds={selectedSceneAssetIds}
            draftReferenceAssets={productionAssets}
            draftSeriesId={selectedCaseSeriesId}
            draftEpisodeId={selectedCaseEpisodeId}
            draftStoryWorldId={selectedCaseStoryWorldId}
            draftLessonOrTheme={caseLessonOrTheme}
            draftGoal={caseGoal}
            draftConflict={caseConflict}
            draftTone={caseTone}
            clearDraftPreview={() => setCaseDraftPreview(null)}
            confirmDraftCase={handleConfirmDraftCase}
            createCase={handleConfirmDraftCase}
            draftPreview={caseDraftPreview}
            generateDraftScriptStory={() => void handleGenerateDraftScriptStory()}
            generateImagesForJob={(job) => void handleGenerateImages(job)}
            generateBgmForJob={(job) => void handleGenerateBgm(job)}
            generateScriptStoryForJob={(job) => void handleGenerateScriptStory(job)}
            generateTtsForJob={(job) => void handleGenerateTts(job)}
            generateVideoClipForJob={(job) => void handleGenerateVideoClip(job)}
            generateVideoForJob={(job) => void handleGenerateVideo(job)}
            generateSceneImageForJob={(job, scene) => void handleGenerateSceneImage(job, scene)}
            runQcForJob={(job) => void handleRunQc(job)}
            apiState={apiState}
            generatingBgmCaseIds={generatingBgmCaseIds}
            generatingCaseIds={generatingCaseIds}
            generatingImageCaseIds={generatingImageCaseIds}
            generatingSceneImageIds={generatingSceneImageIds}
            generatingQcCaseIds={generatingQcCaseIds}
            generatingScriptCaseIds={generatingScriptCaseIds}
            generatingTtsCaseIds={generatingTtsCaseIds}
            generatingVideoClipCaseIds={generatingVideoClipCaseIds}
            generationError={generationError}
            genreText={genreText}
            isAutoGeneratingCase={isAutoGeneratingCase}
            isGeneratingDraftPreview={isGeneratingDraftPreview}
            jobs={jobs}
            language={language}
            prompt={prompt}
            records={jobProcessRecords}
            reportDirtyState={reportDirtyDraft}
            sceneCount={sceneCount}
            selectCase={setSelectedJobId}
            selectedJob={selectedJob}
            selectedActivities={selectedJobActivities}
            selectedPublishTargets={selectedJobPublishTargets}
            selectedCharacter={selectedCharacter}
            selectedProductionAssets={selectedJobProductionAssets}
            selectedSceneReviews={selectedJobSceneReviews}
            selectedQcReport={selectedJobQcReport}
            selectedRecords={selectedJobRecords}
            publishingTargets={publishingTargets}
            productionSchedules={productionSchedules}
            approveCaseForPublishing={approveCaseForPublishing}
            openAssetPlanForJob={openAssetPlanForJob}
            openCostSettings={() => switchView("cost")}
            uploadPrivateTarget={uploadPrivateTarget}
            setCostLimitRM={(value) => {
              setCostLimitRM(value);
              setCaseDraftPreview(null);
            }}
            setGenreText={(value) => {
              setGenreText(value);
              setTemplateType(inferTemplateTypeFromGenre(value));
              setCaseDraftPreview(null);
            }}
            setLanguage={(value) => {
              setLanguage(value);
              setCaseDraftPreview(null);
            }}
            setPrompt={(value) => {
              setPrompt(value);
              setCaseDraftPreview(null);
            }}
            setSceneCount={(value) => {
              setSceneCount(value);
              setCaseDraftPreview(null);
            }}
            setTemplateType={(value) => {
              setTemplateType(value);
              setCaseDraftPreview(null);
            }}
            setTopic={(value) => {
              setTopic(value);
              setCaseDraftPreview(null);
            }}
            setDraftCharacterId={(id) => {
              setSelectedCharacterId(id);
              setCaseDraftPreview(null);
            }}
            setDraftCharacterAssetId={(id) => {
              setSelectedCharacterAssetId(id);
              setSelectedCharacterAssetIds(id ? [id] : []);
              setCaseDraftPreview(null);
            }}
            setDraftBackgroundAssetId={(id) => {
              setSelectedBackgroundAssetId(id);
              setSelectedSceneAssetIds(id ? [id] : []);
              setCaseDraftPreview(null);
            }}
            setDraftCharacterAssetIds={(ids) => {
              setSelectedCharacterAssetIds(ids);
              setSelectedCharacterAssetId(ids[0] ?? null);
              setCaseDraftPreview(null);
            }}
            setDraftSceneAssetIds={(ids) => {
              setSelectedSceneAssetIds(ids);
              setSelectedBackgroundAssetId(ids[0] ?? null);
              setCaseDraftPreview(null);
            }}
            setDraftSeriesId={(id) => {
              setSelectedCaseSeriesId(id);
              const nextSeries = contentSeries.find((series) => series._id === id) ?? null;
              const nextStoryWorld = nextSeries?.storyWorldId ? storyWorlds.find((storyWorld) => storyWorld._id === nextSeries.storyWorldId) ?? null : null;
              const splitAssetIds = splitReadyReferenceAssetIdsByType(mergeIds(
                nextSeries?.referenceAssetIds ?? [],
                nextStoryWorld?.recurringCharacterAssetIds ?? [],
                nextStoryWorld?.defaultSceneAssetIds ?? []
              ));

              setSelectedCaseStoryWorldId(nextSeries?.storyWorldId ?? "");
              setSelectedCharacterAssetIds(splitAssetIds.characterAssetIds);
              setSelectedSceneAssetIds(splitAssetIds.sceneAssetIds);
              setSelectedCharacterAssetId(splitAssetIds.characterAssetIds[0] ?? null);
              setSelectedBackgroundAssetId(splitAssetIds.sceneAssetIds[0] ?? null);
              setCaseDraftPreview(null);
            }}
            setDraftEpisodeId={(id) => {
              const nextEpisode = seriesEpisodes.find((episode) => episode._id === id) ?? null;
              setSelectedCaseEpisodeId(id);
              if (nextEpisode) {
                const activeSeries = contentSeries.find((series) => series._id === selectedCaseSeriesId) ?? null;
                const activeStoryWorld = selectedCaseStoryWorldId || activeSeries?.storyWorldId
                  ? storyWorlds.find((storyWorld) => storyWorld._id === (selectedCaseStoryWorldId || activeSeries?.storyWorldId)) ?? null
                  : null;
                const episodeHasExplicitAssets = nextEpisode.selectedCharacterAssetIds.length > 0 || nextEpisode.selectedSceneAssetIds.length > 0;
                const splitAssetIds = splitReadyReferenceAssetIdsByType(
                  episodeHasExplicitAssets
                    ? mergeIds(nextEpisode.selectedCharacterAssetIds, nextEpisode.selectedSceneAssetIds)
                    : mergeIds(activeSeries?.referenceAssetIds ?? [], activeStoryWorld?.recurringCharacterAssetIds ?? [], activeStoryWorld?.defaultSceneAssetIds ?? [])
                );

                setTopic(nextEpisode.title);
                setCaseLessonOrTheme(nextEpisode.lessonOrTheme || nextEpisode.moralLesson);
                setCaseGoal(nextEpisode.promptSeed);
                setCaseConflict(nextEpisode.synopsis);
                setSelectedCharacterAssetIds(splitAssetIds.characterAssetIds);
                setSelectedSceneAssetIds(splitAssetIds.sceneAssetIds);
                setSelectedCharacterAssetId(splitAssetIds.characterAssetIds[0] ?? null);
                setSelectedBackgroundAssetId(splitAssetIds.sceneAssetIds[0] ?? null);
              }
              setCaseDraftPreview(null);
            }}
            setDraftStoryWorldId={(id) => {
              const nextStoryWorld = storyWorlds.find((storyWorld) => storyWorld._id === id) ?? null;
              const splitAssetIds = splitReadyReferenceAssetIdsByType(mergeIds(
                nextStoryWorld?.recurringCharacterAssetIds ?? [],
                nextStoryWorld?.defaultSceneAssetIds ?? []
              ));

              setSelectedCaseStoryWorldId(id);
              if (splitAssetIds.characterAssetIds.length > 0) {
                setSelectedCharacterAssetIds((currentIds) => mergeIds(currentIds, splitAssetIds.characterAssetIds));
                setSelectedCharacterAssetId((currentId) => currentId ?? splitAssetIds.characterAssetIds[0] ?? null);
              }
              if (splitAssetIds.sceneAssetIds.length > 0) {
                setSelectedSceneAssetIds((currentIds) => mergeIds(currentIds, splitAssetIds.sceneAssetIds));
                setSelectedBackgroundAssetId((currentId) => currentId ?? splitAssetIds.sceneAssetIds[0] ?? null);
              }
              setCaseDraftPreview(null);
            }}
            setDraftLessonOrTheme={(value) => {
              setCaseLessonOrTheme(value);
              setCaseDraftPreview(null);
            }}
            setDraftGoal={(value) => {
              setCaseGoal(value);
              setCaseDraftPreview(null);
            }}
            setDraftConflict={(value) => {
              setCaseConflict(value);
              setCaseDraftPreview(null);
            }}
            setDraftTone={(value) => {
              setCaseTone(value);
              setCaseDraftPreview(null);
            }}
            storedVideos={storedVideos}
            series={contentSeries}
            seriesEpisodes={seriesEpisodes}
            storyWorlds={storyWorlds}
            templateType={templateType}
            toolProviderSettings={toolProviderSettings}
            topic={topic}
            updateCaseDetails={updateCaseDetails}
            updateJob={updateJob}
            updateProcessRecord={updateProcessRecord}
            updateSceneReview={updateSceneReview}
          />
        ) : null}

        {activeView === "assets" ? (
          <AssetsPage
            assetError={assetError}
            assets={productionAssets}
            bootstrapAssetsForJob={(job) => void handleBootstrapProductionAssets(job)}
            createDesignAsset={(input) => handleCreateDesignProductionAsset(input)}
            createManualAsset={(job) => void handleCreateProductionAsset(job)}
            cloneAsset={(asset) => handleCloneProductionAsset(asset)}
            deleteAsset={(id) => void handleDeleteProductionAsset(id)}
            filterJobId={assetFilterJobId}
            filterStatus={assetFilterStatus}
            generateAsset={(asset) => void handleGenerateProductionAsset(asset)}
            generatingAssetIds={generatingProductionAssetIds}
            importLegacyAssets={() => void handleImportLegacyProductionAssets()}
            isLoadingAssets={isLoadingProductionAssets}
            jobs={jobs}
            openCase={(jobId) => {
              setSelectedJobId(jobId);
              switchView("cases");
            }}
            reportDirtyState={reportDirtyDraft}
            refreshAssets={() => void refreshProductionAssets()}
            selectedAssetId={selectedProductionAssetId}
            selectAsset={setSelectedProductionAssetId}
            setFilterJobId={setAssetFilterJobId}
            setFilterStatus={setAssetFilterStatus}
            updateAsset={(id, patch) => handleUpdateProductionAsset(id, patch)}
          />
        ) : null}

        {activeView === "agents" ? <AgentsPage agents={staffAgents} endpoints={aiToolEndpoints} reportDirtyState={reportDirtyDraft} setAgents={setStaffAgents} /> : null}

        {activeView === "workflow" ? (
          <WorkflowPage
            agents={staffAgents}
            endpoints={aiToolEndpoints}
            openAgentSettings={() => switchView("agents")}
            openKeySettings={() => switchView("keys")}
            providerKeys={providerKeys}
            reportDirtyState={reportDirtyDraft}
            resetEndpoints={() => setAiToolEndpoints(resetAiToolEndpoints())}
            resetSettings={() => setToolProviderSettings(resetToolProviderSettings())}
            settings={toolProviderSettings}
            setEndpoints={setAiToolEndpoints}
            updateToolSetting={(id, updater) => setToolProviderSettings((currentSettings) => currentSettings.map((setting) => (setting.id === id ? updater(setting) : setting)))}
          />
        ) : null}

        {activeView === "keys" ? (
          <KeysPage
            keys={providerKeys}
            reportDirtyState={reportDirtyDraft}
            resetKeys={() => {
              setProviderKeys(resetProviderKeys());
              setSecretDrafts({});
              setVisibleDrafts({});
            }}
            saveProviderSecret={saveProviderSecret}
            secretDrafts={secretDrafts}
            toggleSecretDraftVisibility={(id) =>
              setVisibleDrafts((currentVisibleDrafts) => ({
                ...currentVisibleDrafts,
                [id]: !currentVisibleDrafts[id]
              }))
            }
            updateSecretDraft={(id, value) =>
              setSecretDrafts((currentDrafts) => ({
                ...currentDrafts,
                [id]: value
              }))
            }
            updateProviderKey={updateProviderKey}
            visibleDrafts={visibleDrafts}
          />
        ) : null}

        {activeView === "youtube" ? (
          <YouTubePage
            accounts={accounts}
            canUpload={canUpload}
            createPublishingTarget={handleCreatePublishingTarget}
            handleConnectAccount={handleConnectAccount}
            publishingTargets={publishingTargets}
            reportDirtyState={reportDirtyDraft}
            updateAccount={updateAccount}
            updatePublishingTarget={updatePublishingTarget}
          />
        ) : null}

        {activeView === "storage" ? (
          <StoragePage
            canUpload={canUpload}
            settings={storageSettings}
            reportDirtyState={reportDirtyDraft}
            setSettings={setStorageSettings}
            storedVideos={storedVideos}
            updateStoredVideo={updateStoredVideo}
          />
        ) : null}

        {activeView === "cost" ? (
          <CostPage
            budgetSettings={budgetSettings}
            jobs={jobs}
            openCase={(id) => {
              setSelectedJobId(id);
              switchView("cases");
            }}
            reportDirtyState={reportDirtyDraft}
            storedVideos={storedVideos}
            summary={summary}
            updateCaseDetails={updateCaseDetails}
            updateBudgetSettings={updateBudgetSettings}
          />
        ) : null}
      </section>
    </main>
  );
}

function NavButton(props: { active: boolean; icon: ReactNode; label: string; onClick: () => void }) {
  return (
    <button className={`nav-item ${props.active ? "active" : ""}`} type="button" onClick={props.onClick}>
      {props.icon}
      {props.label}
    </button>
  );
}

function StatusButton(props: { label: string; onClick: () => void; state: ServiceState | ApiState }) {
  return (
    <button className={`status-button ${props.state}`} type="button" onClick={props.onClick}>
      {props.state === "online" ? <CheckCircle2 size={15} /> : null}
      {props.state === "offline" ? <XCircle size={15} /> : null}
      {props.state === "checking" ? <RefreshCw size={15} className="spin" /> : null}
      {props.state === "warning" ? <Database size={15} /> : null}
      {props.label}
    </button>
  );
}
