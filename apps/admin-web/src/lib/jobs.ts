import type { ContentTemplateType, GeneratedImageAsset, GeneratedImageQualityCheck, GeneratedInterpretedIdea, GeneratedOutlineQualityCheck, GeneratedVisualBible, JobStatus, ProductionBrief } from "@ai-content-factory/shared-types";
import {
  defaultStaffAgents,
  getAgentLabel,
  getDefaultOwnerAgentIdForStage,
  type StaffAgent
} from "./agents.js";
import type { AiToolEndpoint } from "./admin-data.js";
import { createId } from "./ids.js";
import { readJson, writeJson } from "./local-storage.js";
import { productionStages, type ProductionStageId } from "./production.js";
import type { CharacterProfile } from "./admin-data.js";

export interface AdminJob {
  backgroundAssetId: string | null;
  characterAssetIds: string[];
  characterAssetId: string | null;
  characterId: string | null;
  id: string;
  source: "manual" | "scheduled";
  scheduleId: string | null;
  scheduleRunId: string | null;
  seriesId: string | null;
  episodeId: string | null;
  topic: string;
  prompt: string;
  productionBrief: ProductionBrief | null;
  sceneAssetIds: string[];
  storyWorldId: string | null;
  genre: string;
  templateType: ContentTemplateType;
  language: "zh-CN" | "en-US";
  durationSeconds: number;
  sceneCount: number;
  costLimitRM: number;
  actualCostRM: number;
  status: JobStatus;
  privacy: "private";
  reviewStatus: "draft" | "needs_review" | "approved";
  interpretedIdea: GeneratedInterpretedIdea | null;
  outlineQc: GeneratedOutlineQualityCheck | null;
  visualBible: GeneratedVisualBible | null;
  createdAt: string;
  updatedAt: string;
}

export interface NewJobInput {
  backgroundAssetId?: string | null;
  characterAssetIds?: string[] | undefined;
  characterAssetId?: string | null;
  characterId?: string | null;
  id?: string;
  source?: AdminJob["source"];
  scheduleId?: string | null;
  scheduleRunId?: string | null;
  seriesId?: string | null;
  episodeId?: string | null;
  topic: string;
  prompt: string;
  productionBrief?: ProductionBrief | null | undefined;
  sceneAssetIds?: string[] | undefined;
  storyWorldId?: string | null | undefined;
  genre?: string | undefined;
  templateType: AdminJob["templateType"];
  language: AdminJob["language"];
  durationSeconds?: number | undefined;
  sceneCount: number;
  costLimitRM: number;
}

export type ProcessRecordStatus = "pending" | "working" | "done" | "failed" | "skipped";

export interface JobProcessRecord {
  id: string;
  jobId: string;
  order: number;
  stageId: ProductionStageId;
  stageName: string;
  ownerAgentId: string;
  owner: string;
  provider: string;
  queueName: string;
  status: ProcessRecordStatus;
  input: string;
  output: string;
  artifactPath: string;
  costRM: number;
  notes: string;
  updatedAt: string;
}

export type CaseActivityType =
  | "case_created"
  | "script_preview_generated"
  | "script_preview_approved"
  | "script_generated"
  | "video_generated"
  | "stage_updated"
  | "case_advanced"
  | "case_retried"
  | "case_failed"
  | "stored"
  | "case_approved"
  | "publish_target_uploaded"
  | "schedule_run"
  | "error";

export interface CaseActivity {
  id: string;
  jobId: string;
  type: CaseActivityType;
  title: string;
  detail: string;
  actor: string;
  createdAt: string;
}

export type SceneReviewStatus = "generated" | "needs_review" | "approved" | "rejected";

export interface SceneReviewItem {
  id: string;
  artifactPath: string;
  jobId: string;
  notes: string;
  prompt: string;
  qcIssues: string[];
  qcStatus: GeneratedImageQualityCheck["status"] | "not_checked";
  qcSummary: string;
  referenceImagePath: string;
  sceneId: number;
  status: SceneReviewStatus;
  updatedAt: string;
}

export type CaseReferenceAssetType = "character_design" | "scene_design" | "style_reference" | "first_frame" | "last_frame";
export type SeedanceReferenceRole = "first_frame" | "last_frame" | "reference_image";

export interface CaseReferenceAsset {
  enabled: boolean;
  id: string;
  jobId: string;
  label: string;
  notes: string;
  role: SeedanceReferenceRole;
  sceneId: number | null;
  type: CaseReferenceAssetType;
  updatedAt: string;
  url: string;
}

const storageKey = "ai-content-factory:admin-jobs";
const processRecordsStorageKey = "ai-content-factory:job-process-records";
const caseActivitiesStorageKey = "ai-content-factory:case-activities";
const sceneReviewsStorageKey = "ai-content-factory:scene-reviews";
const caseReferenceAssetsStorageKey = "ai-content-factory:case-reference-assets";

export function loadJobs(): AdminJob[] {
  const jobs = readJson<AdminJob[]>(storageKey, []);
  const migratedJobs = jobs.filter((job) => !isDemoCaseId(job.id));

  if (migratedJobs.length !== jobs.length) {
    writeJson(storageKey, migratedJobs);
  }

  return migratedJobs.map((job) => ({
    ...job,
    backgroundAssetId: job.backgroundAssetId ?? null,
    characterAssetIds: Array.isArray(job.characterAssetIds) ? job.characterAssetIds : (job.characterAssetId ? [job.characterAssetId] : []),
    characterAssetId: job.characterAssetId ?? null,
    characterId: job.characterId ?? null,
    episodeId: job.episodeId ?? null,
    genre: job.genre ?? getTemplateGenreLabel(job.templateType),
    interpretedIdea: job.interpretedIdea ?? null,
    outlineQc: job.outlineQc ?? null,
    prompt: job.prompt ?? "",
    productionBrief: job.productionBrief ?? null,
    reviewStatus: job.reviewStatus ?? (job.status === "READY_TO_UPLOAD" || job.status === "QC_PASSED" ? "needs_review" : "draft"),
    scheduleId: job.scheduleId ?? null,
    scheduleRunId: job.scheduleRunId ?? null,
    sceneAssetIds: Array.isArray(job.sceneAssetIds) ? job.sceneAssetIds : (job.backgroundAssetId ? [job.backgroundAssetId] : []),
    seriesId: job.seriesId ?? null,
    source: job.source ?? "manual",
    storyWorldId: job.storyWorldId ?? null,
    visualBible: job.visualBible ?? null
  }));
}

export function saveJobs(jobs: AdminJob[]): void {
  writeJson(storageKey, jobs);
}

export function createJob(input: NewJobInput): AdminJob {
  const now = new Date().toISOString();

  return {
    id: input.id ?? createId("job"),
    backgroundAssetId: input.backgroundAssetId ?? null,
    characterAssetIds: input.characterAssetIds ?? (input.characterAssetId ? [input.characterAssetId] : []),
    characterAssetId: input.characterAssetId ?? null,
    characterId: input.characterId ?? null,
    source: input.source ?? "manual",
    scheduleId: input.scheduleId ?? null,
    scheduleRunId: input.scheduleRunId ?? null,
    seriesId: input.seriesId ?? null,
    episodeId: input.episodeId ?? null,
    topic: input.topic,
    prompt: input.prompt,
    productionBrief: input.productionBrief ?? null,
    sceneAssetIds: input.sceneAssetIds ?? (input.backgroundAssetId ? [input.backgroundAssetId] : []),
    storyWorldId: input.storyWorldId ?? null,
    genre: input.genre?.trim() || getTemplateGenreLabel(input.templateType),
    templateType: input.templateType,
    language: input.language,
    durationSeconds: input.durationSeconds ?? 45,
    sceneCount: input.sceneCount,
    costLimitRM: input.costLimitRM,
    actualCostRM: 0,
    status: "PENDING",
    privacy: "private",
    reviewStatus: "draft",
    interpretedIdea: null,
    outlineQc: null,
    visualBible: null,
    createdAt: now,
    updatedAt: now
  };
}

function getTemplateGenreLabel(templateType: ContentTemplateType): string {
  const labels: Record<ContentTemplateType, string> = {
    comedy_sketch: "喜剧短剧",
    fairy_tale: "童话故事",
    romance_story: "爱情故事",
    rules_horror: "恐怖规则",
    surveillance_horror: "监控悬疑",
    urban_legend: "都市传说"
  };

  return labels[templateType];
}

export function createProcessRecordsForJob(
  job: AdminJob,
  agents: StaffAgent[] = defaultStaffAgents,
  endpoints: AiToolEndpoint[] = []
): JobProcessRecord[] {
  const now = new Date().toISOString();

  return productionStages.map((stage) => {
    const ownerAgentId = getDefaultOwnerAgentIdForStage(stage.id, agents);
    const endpoint = endpoints.find((candidate) => candidate.stageIds.includes(stage.id));
    const isStageDisabled = endpoint ? !endpoint.enabled || endpoint.status === "disabled" : stage.id === "video";

    return {
      id: `${job.id}_${stage.id}`,
      jobId: job.id,
      order: stage.order,
      stageId: stage.id,
      stageName: stage.label,
      ownerAgentId,
      owner: getAgentLabel(ownerAgentId, agents),
      provider: endpoint?.provider ?? stage.provider,
      queueName: endpoint?.queueName ?? stage.queueName,
      status: stage.id === "brief" ? "done" : isStageDisabled ? "skipped" : "pending",
      input: getDefaultStageInput(job, stage.id, stage.defaultInput),
      output: getDefaultStageOutput(job, stage.id, stage.defaultOutput),
      artifactPath: stage.id === "brief" ? `case://${job.id}` : "",
      costRM: 0,
      notes: "",
      updatedAt: now
    };
  });
}

export function loadJobProcessRecords(jobs: AdminJob[], agents: StaffAgent[] = defaultStaffAgents): JobProcessRecord[] {
  const loadedRecords = readJson<JobProcessRecord[]>(
    processRecordsStorageKey,
    jobs.flatMap((job) => syncProcessRecordsWithJob(job, createProcessRecordsForJob(job, agents), agents))
  );

  const recordsByJobId = new Map<string, JobProcessRecord[]>();

  for (const record of loadedRecords) {
    recordsByJobId.set(record.jobId, [...(recordsByJobId.get(record.jobId) ?? []), record]);
  }

  const mergedRecords = jobs.flatMap((job) => {
    const existingRecords = recordsByJobId.get(job.id);
    return existingRecords && existingRecords.length > 0
      ? syncProcessRecordsWithJob(job, mergeMissingProcessRecords(job, existingRecords, agents), agents)
      : syncProcessRecordsWithJob(job, createProcessRecordsForJob(job, agents), agents);
  });

  writeJson(processRecordsStorageKey, mergedRecords);
  return mergedRecords;
}

export function saveJobProcessRecords(records: JobProcessRecord[]): void {
  writeJson(processRecordsStorageKey, records);
}

export function loadCaseActivities(jobs: AdminJob[]): CaseActivity[] {
  const jobIds = new Set(jobs.map((job) => job.id));
  const activities = readJson<CaseActivity[]>(caseActivitiesStorageKey, []);
  const migratedActivities = activities
    .filter((activity) => jobIds.has(activity.jobId) && !isDemoCaseId(activity.jobId))
    .map(normalizeCaseActivity);

  if (migratedActivities.length !== activities.length) {
    writeJson(caseActivitiesStorageKey, migratedActivities);
  }

  return migratedActivities;
}

export function saveCaseActivities(activities: CaseActivity[]): void {
  writeJson(caseActivitiesStorageKey, activities);
}

export function loadSceneReviews(jobs: AdminJob[]): SceneReviewItem[] {
  const jobIds = new Set(jobs.map((job) => job.id));
  const reviews = readJson<SceneReviewItem[]>(sceneReviewsStorageKey, []);
  const normalizedReviews = reviews.filter((review) => jobIds.has(review.jobId)).map(normalizeSceneReview);

  if (normalizedReviews.length !== reviews.length) {
    writeJson(sceneReviewsStorageKey, normalizedReviews);
  }

  return normalizedReviews;
}

export function saveSceneReviews(reviews: SceneReviewItem[]): void {
  writeJson(sceneReviewsStorageKey, reviews.map(normalizeSceneReview));
}

export function loadCaseReferenceAssets(jobs: AdminJob[]): CaseReferenceAsset[] {
  const jobIds = new Set(jobs.map((job) => job.id));
  const assets = readJson<CaseReferenceAsset[]>(caseReferenceAssetsStorageKey, []);
  const normalizedAssets = assets.filter((asset) => jobIds.has(asset.jobId)).map(normalizeCaseReferenceAsset);

  if (normalizedAssets.length !== assets.length) {
    writeJson(caseReferenceAssetsStorageKey, normalizedAssets);
  }

  return normalizedAssets;
}

export function saveCaseReferenceAssets(assets: CaseReferenceAsset[]): void {
  writeJson(caseReferenceAssetsStorageKey, assets.map(normalizeCaseReferenceAsset));
}

export function createCaseReferenceAsset(input: Partial<CaseReferenceAsset> & Pick<CaseReferenceAsset, "jobId">): CaseReferenceAsset {
  const now = new Date().toISOString();

  return normalizeCaseReferenceAsset({
    enabled: input.enabled ?? true,
    id: input.id ?? createId("ref"),
    jobId: input.jobId,
    label: input.label ?? "New reference asset",
    notes: input.notes ?? "",
    role: input.role ?? "reference_image",
    sceneId: input.sceneId ?? null,
    type: input.type ?? "style_reference",
    updatedAt: input.updatedAt ?? now,
    url: input.url ?? ""
  });
}

export function syncCaseReferenceAssets(
  assets: CaseReferenceAsset[],
  jobs: AdminJob[],
  sceneReviews: SceneReviewItem[],
  characters: CharacterProfile[]
): CaseReferenceAsset[] {
  const jobIds = new Set(jobs.map((job) => job.id));
  const normalizedAssets = assets.filter((asset) => jobIds.has(asset.jobId)).map(normalizeCaseReferenceAsset);
  const assetsById = new Map(normalizedAssets.map((asset) => [asset.id, asset]));
  const nextAssets = [...normalizedAssets];

  jobs.forEach((job) => {
    const character = job.characterId ? characters.find((candidate) => candidate.id === job.characterId) : null;
    const generatedReferenceUrl = sceneReviews.find((review) => review.jobId === job.id && review.referenceImagePath)?.referenceImagePath;
    const characterReferenceUrl = character?.referenceImageUrl || generatedReferenceUrl;

    if (characterReferenceUrl) {
      upsertGeneratedReferenceAsset(nextAssets, assetsById, {
        id: `${job.id}_character_reference`,
        jobId: job.id,
        label: character ? `${character.name} character design` : "Generated character design",
        notes: "Used as Seedance reference_image for character identity continuity.",
        role: "reference_image",
        sceneId: null,
        type: "character_design",
        url: characterReferenceUrl
      });
    }

    sceneReviews
      .filter((review) => review.jobId === job.id && review.artifactPath)
      .forEach((review) => {
        upsertGeneratedReferenceAsset(nextAssets, assetsById, {
          id: `${job.id}_scene_${review.sceneId}_first_frame`,
          jobId: job.id,
          label: `Scene ${review.sceneId} first frame`,
          notes: "Generated scene still. Seedance uses this as first_frame for image-to-video.",
          role: "first_frame",
          sceneId: review.sceneId,
          type: "first_frame",
          url: review.artifactPath
        });
      });
  });

  return nextAssets.sort((left, right) => left.jobId.localeCompare(right.jobId) || (left.sceneId ?? 0) - (right.sceneId ?? 0) || left.label.localeCompare(right.label));
}

export function createSceneReviewItems(jobId: string, images: GeneratedImageAsset[], existingReviews: SceneReviewItem[] = []): SceneReviewItem[] {
  const now = new Date().toISOString();
  const existingByScene = new Map(existingReviews.filter((review) => review.jobId === jobId).map((review) => [review.sceneId, review]));

  return images.map((image) => {
    const existing = existingByScene.get(image.sceneId);

    return normalizeSceneReview({
      artifactPath: image.asset.publicUrl ?? image.asset.storagePath,
      id: existing?.id ?? `${jobId}_scene_${image.sceneId}`,
      jobId,
      notes: image.qualityCheck?.summary ?? existing?.notes ?? "",
      prompt: image.prompt,
      qcIssues: image.qualityCheck?.issues ?? existing?.qcIssues ?? [],
      qcStatus: image.qualityCheck?.status ?? existing?.qcStatus ?? "not_checked",
      qcSummary: image.qualityCheck?.summary ?? existing?.qcSummary ?? "",
      referenceImagePath: image.referenceImage?.publicUrl ?? image.referenceImage?.storagePath ?? existing?.referenceImagePath ?? "",
      sceneId: image.sceneId,
      status: image.qualityCheck?.status === "fail" ? "needs_review" : "generated",
      updatedAt: now
    });
  });
}

export function createCaseActivity(input: Omit<CaseActivity, "id" | "actor" | "createdAt"> & Partial<Pick<CaseActivity, "actor" | "createdAt">>): CaseActivity {
  return {
    actor: "AI Producer Agent",
    createdAt: new Date().toISOString(),
    id: createId("activity"),
    ...input
  };
}

export function syncRecordsWithAgents(records: JobProcessRecord[], agents: StaffAgent[]): JobProcessRecord[] {
  return records.map((record) => {
    const ownerAgentId = record.ownerAgentId || getDefaultOwnerAgentIdForStage(record.stageId, agents);

    return {
      ...record,
      ownerAgentId,
      owner: getAgentLabel(ownerAgentId, agents)
    };
  });
}

function mergeMissingProcessRecords(job: AdminJob, records: JobProcessRecord[], agents: StaffAgent[]): JobProcessRecord[] {
  const existingStageIds = new Set(records.map((record) => record.stageId));
  const missingRecords = createProcessRecordsForJob(job, agents).filter((record) => !existingStageIds.has(record.stageId));

  return [...records, ...missingRecords].sort((left, right) => left.order - right.order);
}

function normalizeCaseActivity(activity: CaseActivity): CaseActivity {
  return {
    actor: activity.actor ?? "AI Producer Agent",
    createdAt: activity.createdAt ?? new Date().toISOString(),
    detail: activity.detail ?? "",
    id: activity.id ?? createId("activity"),
    jobId: activity.jobId,
    title: activity.title ?? "Case activity",
    type: activity.type ?? "stage_updated"
  };
}

function normalizeSceneReview(review: SceneReviewItem): SceneReviewItem {
  const status = review.status === "approved" || review.status === "rejected" || review.status === "needs_review" ? review.status : "generated";
  const qcStatus = review.qcStatus === "pass" || review.qcStatus === "warning" || review.qcStatus === "fail" ? review.qcStatus : "not_checked";

  return {
    artifactPath: review.artifactPath ?? "",
    id: review.id || `${review.jobId}_scene_${review.sceneId}`,
    jobId: review.jobId,
    notes: review.notes ?? "",
    prompt: review.prompt ?? "",
    qcIssues: review.qcIssues ?? [],
    qcStatus,
    qcSummary: review.qcSummary ?? "",
    referenceImagePath: review.referenceImagePath ?? "",
    sceneId: Math.max(1, Math.round(Number(review.sceneId) || 1)),
    status,
    updatedAt: review.updatedAt ?? new Date().toISOString()
  };
}

function upsertGeneratedReferenceAsset(
  assets: CaseReferenceAsset[],
  assetsById: Map<string, CaseReferenceAsset>,
  input: Omit<CaseReferenceAsset, "enabled" | "updatedAt">
): void {
  const existing = assetsById.get(input.id);
  const nextAsset = normalizeCaseReferenceAsset({
    ...input,
    enabled: existing?.enabled ?? true,
    updatedAt: existing?.updatedAt ?? new Date().toISOString()
  });

  if (existing) {
    const index = assets.findIndex((asset) => asset.id === input.id);

    if (index >= 0 && (assets[index]?.url !== input.url || assets[index]?.label !== input.label || assets[index]?.notes !== input.notes || assets[index]?.role !== input.role || assets[index]?.type !== input.type)) {
      assets[index] = {
        ...nextAsset,
        updatedAt: new Date().toISOString()
      };
    }
    return;
  }

  assets.push(nextAsset);
  assetsById.set(nextAsset.id, nextAsset);
}

function normalizeCaseReferenceAsset(asset: CaseReferenceAsset): CaseReferenceAsset {
  const type: CaseReferenceAssetType =
    asset.type === "character_design" || asset.type === "scene_design" || asset.type === "style_reference" || asset.type === "first_frame" || asset.type === "last_frame"
      ? asset.type
      : "style_reference";
  const role: SeedanceReferenceRole =
    asset.role === "first_frame" || asset.role === "last_frame" || asset.role === "reference_image"
      ? asset.role
      : type === "first_frame"
        ? "first_frame"
        : type === "last_frame"
          ? "last_frame"
          : "reference_image";
  const sceneId = asset.sceneId === null || asset.sceneId === undefined || asset.sceneId === 0 ? null : Math.max(1, Math.round(Number(asset.sceneId) || 1));

  return {
    enabled: asset.enabled ?? true,
    id: asset.id || createId("ref"),
    jobId: asset.jobId,
    label: asset.label || getDefaultReferenceAssetLabel(type, sceneId),
    notes: asset.notes ?? "",
    role,
    sceneId,
    type,
    updatedAt: asset.updatedAt ?? new Date().toISOString(),
    url: asset.url ?? ""
  };
}

function getDefaultReferenceAssetLabel(type: CaseReferenceAssetType, sceneId: number | null): string {
  const prefix = sceneId ? `Scene ${sceneId} ` : "";
  const labels: Record<CaseReferenceAssetType, string> = {
    character_design: "Character design",
    first_frame: "First frame",
    last_frame: "Last frame",
    scene_design: "Scene design",
    style_reference: "Style reference"
  };

  return `${prefix}${labels[type]}`.trim();
}

function stageOrderForStatus(status: JobStatus): { order: number; status: ProcessRecordStatus } {
  const mapping: Partial<Record<JobStatus, { order: number; status: ProcessRecordStatus }>> = {
    PENDING: { order: 1, status: "done" },
    SCRIPT_GENERATING: { order: 2, status: "working" },
    SCRIPT_DONE: { order: 2, status: "done" },
    STORYBOARD_GENERATING: { order: 3, status: "working" },
    STORYBOARD_DONE: { order: 3, status: "done" },
    IMAGE_GENERATING: { order: 5, status: "working" },
    IMAGE_DONE: { order: 5, status: "done" },
    VIDEO_GENERATING: { order: 6, status: "working" },
    VIDEO_DONE: { order: 6, status: "done" },
    TTS_GENERATING: { order: 7, status: "working" },
    TTS_DONE: { order: 7, status: "done" },
    BGM_GENERATING: { order: 8, status: "working" },
    BGM_DONE: { order: 8, status: "done" },
    COMPOSING: { order: 10, status: "working" },
    COMPOSED: { order: 10, status: "done" },
    QC_CHECKING: { order: 11, status: "working" },
    QC_PASSED: { order: 11, status: "done" },
    READY_TO_UPLOAD: { order: 11, status: "done" },
    UPLOADING: { order: 12, status: "working" },
    UPLOADED_PRIVATE: { order: 12, status: "done" },
    COMPLETED: { order: 13, status: "done" },
    FAILED: { order: 13, status: "failed" }
  };

  return mapping[status] ?? { order: 1, status: "pending" };
}

export function syncProcessRecordsWithJob(
  job: AdminJob,
  records: JobProcessRecord[],
  agents: StaffAgent[] = defaultStaffAgents
): JobProcessRecord[] {
  const current = stageOrderForStatus(job.status);
  const now = new Date().toISOString();

  return records.map((record) => {
    if (record.jobId !== job.id) {
      return record;
    }

    const normalizedRecord = normalizeProcessRecord(job, record, agents);

    if (normalizedRecord.stageId === "video" && normalizedRecord.status === "skipped") {
      return {
        ...normalizedRecord,
        updatedAt: now
      };
    }

    if (normalizedRecord.stageId === "tts" && normalizedRecord.output.includes("spoken TTS audio has not been generated")) {
      return {
        ...normalizedRecord,
        status: "pending",
        updatedAt: now
      };
    }

    let status: ProcessRecordStatus = "pending";

    if (normalizedRecord.order < current.order) {
      status = "done";
    } else if (normalizedRecord.order === current.order) {
      status = current.status;
    }

    return {
      ...normalizedRecord,
      status,
      updatedAt: now
    };
  });
}

function normalizeProcessRecord(job: AdminJob, record: JobProcessRecord, agents: StaffAgent[]): JobProcessRecord {
  const stage = productionStages.find((candidate) => candidate.id === record.stageId);
  const ownerAgentId = record.ownerAgentId || getDefaultOwnerAgentIdForStage(record.stageId, agents);
  const artifactPath = record.artifactPath ?? "";
  const costRM = normalizeLegacyStageCost(record.stageId, record.provider ?? stage?.provider ?? "", record.costRM ?? 0, artifactPath);

  return {
    ...record,
    order: record.order || stage?.order || 1,
    stageName: record.stageName || stage?.label || record.stageId,
    ownerAgentId,
    owner: getAgentLabel(ownerAgentId, agents),
    provider: record.provider || stage?.provider || "Unknown",
    queueName: record.queueName || stage?.queueName || "manual",
    input: record.input || getDefaultStageInput(job, record.stageId, stage?.defaultInput ?? ""),
    output: normalizeLegacyStageOutput(record.stageId, record.output || getDefaultStageOutput(job, record.stageId, stage?.defaultOutput ?? ""), artifactPath),
    artifactPath,
    costRM,
    notes: record.notes ?? "",
    updatedAt: record.updatedAt ?? new Date().toISOString()
  };
}

function normalizeLegacyStageOutput(stageId: ProductionStageId, output: string, artifactPath: string): string {
  if (stageId === "tts" && output.includes("Local voiceover text artifact")) {
    return "Voiceover text and SFX cue manifest are ready, but spoken TTS audio has not been generated. Configure OpenAI TTS or ElevenLabs; no mock narration audio was created.";
  }

  if (stageId !== "image" || !output.includes("local SVG scene placeholders")) {
    return output;
  }

  const artifactPaths = artifactPath
    .split("\n")
    .map((artifact) => artifact.trim())
    .filter(Boolean);
  const rasterCount = artifactPaths.filter((artifact) => /\.(png|jpe?g|webp|bmp)(\?|$)/iu.test(artifact)).length;

  if (rasterCount > 0) {
    return `${rasterCount} generated scene image(s) are ready for review. These PNG/JPG assets are the images used by video compose.`;
  }

  return "Required OpenAI scene images are missing. Click Generate images to create reviewable PNG scene assets.";
}

function normalizeLegacyStageCost(stageId: ProductionStageId, provider: string, costRM: number, artifactPath: string): number {
  if (stageId !== "image" || costRM > 0 || !provider.toLowerCase().includes("openai")) {
    return costRM;
  }

  const rasterCount = artifactPath
    .split("\n")
    .map((artifact) => artifact.trim())
    .filter((artifact) => /\.(png|jpe?g|webp|bmp)(\?|$)/iu.test(artifact)).length;

  return rasterCount > 0 ? Number((rasterCount * 0.016 * 3.95).toFixed(4)) : costRM;
}

function getDefaultStageInput(job: AdminJob, stageId: ProductionStageId, fallback: string): string {
  if (stageId === "brief") {
    return job.prompt;
  }

  if (stageId === "script") {
    return `Write the voiceover and hook from this prompt:\n${job.prompt}`;
  }

  if (stageId === "storyboard") {
    return `Split the script into ${job.sceneCount} scenes for a ${job.durationSeconds}s Short.`;
  }

  return fallback;
}

function getDefaultStageOutput(job: AdminJob, stageId: ProductionStageId, fallback: string): string {
  if (stageId === "brief") {
    return `Case created for topic: ${job.topic}`;
  }

  return fallback;
}

export function advanceJob(job: AdminJob): AdminJob {
  const nextStatusByCurrent: Partial<Record<JobStatus, JobStatus>> = {
    PENDING: "SCRIPT_GENERATING",
    SCRIPT_GENERATING: "SCRIPT_DONE",
    SCRIPT_DONE: "STORYBOARD_GENERATING",
    STORYBOARD_GENERATING: "STORYBOARD_DONE",
    STORYBOARD_DONE: "IMAGE_GENERATING",
    IMAGE_GENERATING: "IMAGE_DONE",
    IMAGE_DONE: "TTS_GENERATING",
    TTS_GENERATING: "TTS_DONE",
    TTS_DONE: "BGM_GENERATING",
    BGM_GENERATING: "BGM_DONE",
    BGM_DONE: "COMPOSING",
    COMPOSING: "COMPOSED",
    COMPOSED: "QC_CHECKING",
    QC_CHECKING: "QC_PASSED",
    QC_PASSED: "READY_TO_UPLOAD",
    READY_TO_UPLOAD: "UPLOADING",
    UPLOADING: "UPLOADED_PRIVATE",
    UPLOADED_PRIVATE: "COMPLETED"
  };

  const nextStatus = nextStatusByCurrent[job.status] ?? job.status;
  const costIncrement = ["IMAGE_GENERATING", "TTS_GENERATING", "COMPOSING"].includes(job.status) ? 0.45 : 0;

  return {
    ...job,
    status: nextStatus,
    actualCostRM: Math.min(job.costLimitRM, Number((job.actualCostRM + costIncrement).toFixed(2))),
    updatedAt: new Date().toISOString()
  };
}

export function markFailed(job: AdminJob): AdminJob {
  return {
    ...job,
    status: "FAILED",
    updatedAt: new Date().toISOString()
  };
}

export function retryJob(job: AdminJob): AdminJob {
  return {
    ...job,
    status: "PENDING",
    updatedAt: new Date().toISOString()
  };
}

export function isDemoCaseId(id: string): boolean {
  return id.startsWith("job_demo_");
}
