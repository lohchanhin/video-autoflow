export const jobStatuses = [
  "PENDING",
  "SCRIPT_GENERATING",
  "SCRIPT_DONE",
  "STORYBOARD_GENERATING",
  "STORYBOARD_DONE",
  "IMAGE_GENERATING",
  "IMAGE_DONE",
  "VIDEO_GENERATING",
  "VIDEO_DONE",
  "TTS_GENERATING",
  "TTS_DONE",
  "BGM_GENERATING",
  "BGM_DONE",
  "COMPOSING",
  "COMPOSED",
  "QC_CHECKING",
  "QC_PASSED",
  "READY_TO_UPLOAD",
  "UPLOADING",
  "UPLOADED_PRIVATE",
  "SCHEDULED",
  "PUBLISHED",
  "ANALYTICS_COLLECTING",
  "COMPLETED",
  "FAILED"
] as const;

export type JobStatus = (typeof jobStatuses)[number];

export const uploadPrivacyStatuses = ["private", "unlisted", "public"] as const;

export type UploadPrivacyStatus = (typeof uploadPrivacyStatuses)[number];

export const contentTemplateTypes = [
  "rules_horror",
  "surveillance_horror",
  "urban_legend",
  "comedy_sketch",
  "romance_story",
  "fairy_tale"
] as const;

export type ContentTemplateType = (typeof contentTemplateTypes)[number];

export interface HealthResponse {
  status: "ok";
  service: "api-server";
  env: string;
  version: string;
  timestamp: string;
}

export interface DatabaseStatusResponse {
  databaseName: string;
  ok: boolean;
  service: "mongodb";
  timestamp: string;
}

export interface ProviderSecretStatus {
  configured: boolean;
  keyName: string;
  lastFour?: string | undefined;
}

export interface ProviderSecretStatusResponse {
  keys: ProviderSecretStatus[];
  timestamp: string;
}

export interface ProviderModelInfo {
  created?: number | undefined;
  id: string;
  ownedBy?: string | undefined;
}

export interface ProviderModelsResponse {
  models: ProviderModelInfo[];
  provider: string;
  source: string;
  timestamp: string;
}

export const productionAssetTypes = ["character_design", "scene_design", "style_reference", "first_frame", "last_frame", "bgm_reference"] as const;
export type ProductionAssetType = (typeof productionAssetTypes)[number];

export const productionAssetStatuses = ["planned", "generating", "ready", "approved", "rejected", "failed"] as const;
export type ProductionAssetStatus = (typeof productionAssetStatuses)[number];

export const productionAssetProviders = ["openai", "seedance", "elevenlabs", "manual", "local"] as const;
export type ProductionAssetProvider = (typeof productionAssetProviders)[number];

export const productionAssetRoles = ["reference_image", "first_frame", "last_frame", "bgm_reference", "none"] as const;
export type ProductionAssetRole = (typeof productionAssetRoles)[number];

export interface ProductionAsset {
  _id: string;
  costRM: number;
  createdAt: string;
  error: string;
  folderName: string;
  jobId: string;
  label: string;
  notes: string;
  prompt: string;
  provider: ProductionAssetProvider;
  role: ProductionAssetRole;
  sceneId: number | null;
  scope: "case" | "scene";
  status: ProductionAssetStatus;
  storagePath: string;
  tags: string[];
  type: ProductionAssetType;
  updatedAt: string;
  url: string;
}

export type CostLogPricingStatus = "actual_usage" | "configured_rate" | "pricing_missing" | "local_zero";
export type CostLogToolType = "llm" | "image" | "design_image" | "tts" | "bgm" | "video" | "subtitle" | "compose" | "storage" | "youtube" | "other";

export interface CostLogUsage {
  [key: string]: boolean | number | string | null | undefined;
}

export interface CostLog {
  _id: string;
  costRM: number;
  costUSD: number;
  createdAt: string;
  currency: "MYR";
  exchangeRate: number;
  jobId: string;
  model: string;
  operation: string;
  provider: string;
  pricingSource: string;
  pricingStatus: CostLogPricingStatus;
  quantity: number;
  service: "script" | "image" | "reference_design" | "tts" | "bgm" | "video" | "compose" | "qc" | "other";
  toolType: CostLogToolType;
  unit: string;
  usage: CostLogUsage;
}

export interface ListCostLogsResponse {
  logs: CostLog[];
  timestamp: string;
}

export interface CostSummaryResponse {
  byProvider: Array<{ costRM: number; provider: CostLog["provider"] }>;
  byService: Array<{ costRM: number; service: CostLog["service"] }>;
  jobId?: string | undefined;
  pricingMissingCount: number;
  totalCostRM: number;
  totalCostUSD: number;
  totalLogs: number;
  timestamp: string;
}

export type ToolCostMode = "tokens" | "image" | "second" | "character" | "credit" | "free" | "custom";

export type ToolProviderType = "llm" | "image" | "design_image" | "tts" | "bgm" | "video" | "subtitle" | "compose" | "storage" | "youtube";

export interface ToolProviderSettings {
  allowAutopilot: boolean;
  apiStyle: string;
  baseUrl: string;
  costMode: ToolCostMode;
  enabled: boolean;
  fallbackCostRM: number;
  id: string;
  inputUnitPriceRM: number;
  model: string;
  outputUnitPriceRM: number;
  params: Record<string, boolean | number | string>;
  provider: string;
  retryLimit: number;
  toolType: ToolProviderType;
  updatedAt: string;
}

export interface ToolCostOverride {
  costMode?: string | undefined;
  fallbackCostRM?: number | undefined;
  inputUnitPriceRM?: number | undefined;
  outputUnitPriceRM?: number | undefined;
  pricingSource?: string | undefined;
}

export interface ToolProviderOverride {
  apiStyle?: string | undefined;
  baseUrl?: string | undefined;
  cost?: ToolCostOverride | undefined;
  model?: string | undefined;
  params?: Record<string, boolean | number | string | null | undefined> | undefined;
  provider?: string | undefined;
}

export interface ListProductionAssetsResponse {
  assets: ProductionAsset[];
  timestamp: string;
}

export interface BootstrapProductionAssetsRequest {
  includeLastFrames?: boolean | undefined;
  jobId: string;
  prompt?: string | undefined;
  sceneCount: number;
  topic: string;
}

export interface BootstrapProductionAssetsResponse {
  assets: ProductionAsset[];
  created: number;
  status: "ASSETS_BOOTSTRAPPED";
}

export interface GenerateProductionAssetResponse {
  asset: ProductionAsset;
  costRM: number;
  status: "ASSET_GENERATED";
}

export const contentSeriesStatuses = ["draft", "active", "paused", "archived"] as const;
export type ContentSeriesStatus = (typeof contentSeriesStatuses)[number];

export const seriesEpisodeIdeaStatuses = ["draft", "approved", "converted_to_case", "rejected"] as const;
export type SeriesEpisodeIdeaStatus = (typeof seriesEpisodeIdeaStatuses)[number];

export interface ContentSeries {
  _id: string;
  audience: string;
  contentType: string;
  createdAt: string;
  description: string;
  durationSeconds: number;
  language: "zh-CN" | "en-US";
  musicStyle: string;
  name: string;
  referenceAssetIds: string[];
  safetyRules: string;
  sceneCount: number;
  status: ContentSeriesStatus;
  storyWorldId: string | null;
  tone: string;
  updatedAt: string;
  values: string;
  visualStyle: string;
}

export interface SeriesEpisodeIdea {
  _id: string;
  ageRange: string;
  caseId: string | null;
  createdAt: string;
  episodeNo: number | null;
  interactiveEnding: string;
  lessonOrTheme: string;
  moralLesson: string;
  promptSeed: string;
  riskNotes: string;
  selectedCharacterAssetIds: string[];
  selectedSceneAssetIds: string[];
  seriesId: string;
  sourceStory: string;
  status: SeriesEpisodeIdeaStatus;
  synopsis: string;
  title: string;
  updatedAt: string;
}

export interface StoryWorld {
  _id: string;
  createdAt: string;
  defaultSceneAssetIds: string[];
  description: string;
  name: string;
  recurringCharacterAssetIds: string[];
  relationshipMap: string;
  safetyRules: string;
  seriesIds: string[];
  status: "draft" | "active" | "archived";
  updatedAt: string;
  visualStyle: string;
}

export interface ListStoryWorldsResponse {
  storyWorlds: StoryWorld[];
  timestamp: string;
}

export interface StoryWorldResponse {
  storyWorld: StoryWorld;
}

export interface ListContentSeriesResponse {
  series: ContentSeries[];
  timestamp: string;
}

export interface ContentSeriesResponse {
  series: ContentSeries;
}

export interface ListSeriesEpisodeIdeasResponse {
  episodes: SeriesEpisodeIdea[];
  timestamp: string;
}

export interface GenerateSeriesEpisodeIdeasRequest {
  count?: number | undefined;
}

export interface GenerateSeriesEpisodeIdeasResponse {
  costRM: number;
  episodes: SeriesEpisodeIdea[];
  model: string;
  provider: string;
  status: "EPISODE_IDEAS_GENERATED";
  usage?: {
    inputTokens: number;
    outputTokens: number;
  } | undefined;
}

export interface SeriesEpisodeIdeaResponse {
  episode: SeriesEpisodeIdea;
}

export interface ConvertSeriesEpisodeToCaseResponse {
  caseSeed: {
    backgroundAssetId: string | null;
    characterAssetId: string | null;
    characterAssetIds: string[];
    costLimitRM: number;
    durationSeconds: number;
    episodeId: string;
    genre: string;
    id: string;
    language: "zh-CN" | "en-US";
    prompt: string;
    productionBrief: ProductionBrief;
    referenceAssetIds: string[];
    sceneCount: number;
    sceneAssetIds: string[];
    seriesId: string;
    storyWorldId: string | null;
    templateType: ContentTemplateType;
    topic: string;
  };
  episode: SeriesEpisodeIdea;
  series: ContentSeries;
  status: "EPISODE_CONVERTED_TO_CASE";
}

export interface BudgetConfig {
  dailyRM: number;
  monthlyRM: number;
  maxPerVideoRM: number;
  maxVideosPerDay: number;
}

export interface GenerateVideoRequest extends ToolProviderOverride {
  costLimitRM: number;
  durationSeconds?: number | undefined;
  genre?: string | undefined;
  jobId?: string | undefined;
  language: "zh-CN" | "en-US";
  prompt: string;
  sceneCount: number;
  templateType: ContentTemplateType;
  topic: string;
}

export interface GenerateScriptStoryRequest extends ToolProviderOverride {
  costLimitRM: number;
  durationSeconds?: number | undefined;
  genre?: string | undefined;
  jobId?: string | undefined;
  language: "zh-CN" | "en-US";
  prompt: string;
  productionBrief?: ProductionBrief | undefined;
  sceneCount: number;
  templateType: ContentTemplateType;
  topic: string;
}

export interface SelectedCharacterContext {
  assetId?: string | undefined;
  label: string;
  notes?: string | undefined;
  role?: string | undefined;
  url?: string | undefined;
  visualIdentity: string;
}

export interface SelectedSceneContext {
  assetId?: string | undefined;
  label: string;
  location?: string | undefined;
  notes?: string | undefined;
  url?: string | undefined;
  visualRules: string;
}

export interface ProductionBrief {
  conflict?: string | undefined;
  episodeContext?: {
    episodeId?: string | undefined;
    episodeNo?: number | null | undefined;
    interactiveEnding?: string | undefined;
    lessonOrTheme?: string | undefined;
    promptSeed?: string | undefined;
    synopsis?: string | undefined;
    title?: string | undefined;
  } | undefined;
  goal?: string | undefined;
  lessonOrTheme?: string | undefined;
  requiredBeats?: string[] | undefined;
  selectedCharacters?: SelectedCharacterContext[] | undefined;
  selectedScenes?: SelectedSceneContext[] | undefined;
  seriesContext?: {
    audience?: string | undefined;
    contentType?: string | undefined;
    description?: string | undefined;
    musicStyle?: string | undefined;
    name?: string | undefined;
    safetyRules?: string | undefined;
    seriesId?: string | undefined;
    tone?: string | undefined;
    values?: string | undefined;
    visualStyle?: string | undefined;
  } | undefined;
  storyWorldContext?: {
    description?: string | undefined;
    name?: string | undefined;
    relationshipMap?: string | undefined;
    safetyRules?: string | undefined;
    storyWorldId?: string | undefined;
    visualStyle?: string | undefined;
  } | undefined;
  tone?: string | undefined;
  visualContinuityRules?: string[] | undefined;
}

export interface GenerationReferenceAsset {
  label: string;
  notes?: string | undefined;
  prompt?: string | undefined;
  role?: ProductionAssetRole | undefined;
  type: ProductionAssetType;
  url: string;
}

export interface GenerateImagesRequest extends ToolProviderOverride {
  character?: {
    name: string;
    referenceNotes?: string | undefined;
    visualIdentity: string;
  } | undefined;
  costLimitRM: number;
  jobId?: string | undefined;
  language: "zh-CN" | "en-US";
  prompt: string;
  references?: GenerationReferenceAsset[] | undefined;
  sceneCount: number;
  templateType: ContentTemplateType;
  topic: string;
}

export interface GenerateSceneImageRequest extends GenerateImagesRequest {
  promptOverride?: string | undefined;
  sceneId: number;
}

export interface GenerateTtsRequest extends ToolProviderOverride {
  costLimitRM: number;
  jobId?: string | undefined;
  language: "zh-CN" | "en-US";
  voice?: string | undefined;
  voiceoverText: string;
}

export interface GenerateBgmRequest extends ToolProviderOverride {
  costLimitRM: number;
  durationSeconds?: number | undefined;
  jobId?: string | undefined;
  language: "zh-CN" | "en-US";
  mood?: string | undefined;
  prompt: string;
  sceneCount: number;
  templateType: ContentTemplateType;
  topic: string;
}

export interface GenerateVideoClipRequest extends ToolProviderOverride {
  aspectRatio?: "9:16" | "16:9" | "1:1" | "4:3" | "3:4" | "21:9" | "adaptive" | undefined;
  costLimitRM: number;
  durationSeconds?: number | undefined;
  imageUrl?: string | undefined;
  jobId?: string | undefined;
  lastFrameImageUrl?: string | undefined;
  prompt: string;
  quality?: "480p" | "720p" | undefined;
  referenceImageUrls?: string[] | undefined;
  sceneId?: number | undefined;
  topic: string;
}

export interface GeneratedScript {
  hook: string;
  title: string;
  voiceover: string;
}

export interface GeneratedStoryboardScene {
  camera: string;
  durationSeconds: number;
  imagePrompt: string;
  sceneId: number;
  sfx: string[];
  visual: string;
  voiceText: string;
}

export interface GeneratedVisualBible {
  character: {
    ageRange: string;
    bodyType: string;
    expressionRange: string;
    fixedProps: string[];
    hair: string;
    name: string;
    role: string;
    signatureDetails: string;
    wardrobe: string;
  };
  environment: {
    keyObjects: string[];
    lighting: string;
    location: string;
    palette: string;
    recurringDetails: string;
  };
  negativePrompt: string;
  style: string;
}

export interface GeneratedInterpretedIdea {
  centralObject: string;
  conflict: string;
  endingHook: string;
  escalation: string;
  expandedPremise: string;
  genre: string;
  logline: string;
  protagonist: string;
  rawTopic: string;
  ruleOrConstraint: string;
  setting: string;
  twist: string;
}

export interface GeneratedOutlineQcCheck {
  detail: string;
  label: string;
  status: "pass" | "fail";
}

export interface GeneratedOutlineQualityCheck {
  checkedAt: string;
  checks: GeneratedOutlineQcCheck[];
  status: "pass" | "needs_review";
  summary: string;
}

export interface GeneratedBackgroundMusicBrief {
  enabled: boolean;
  instrumentation: string;
  mood: string;
  prompt: string;
  style: string;
  tempo: string;
}

export interface GeneratedStorageObject {
  driver: "local" | "gcs";
  fallbackReason?: string | undefined;
  localPath?: string | undefined;
  publicUrl?: string | undefined;
  storagePath: string;
}

export interface GeneratedImageQualityCheck {
  checkedAt: string;
  issues: string[];
  model: string;
  retryCount: number;
  status: "pass" | "warning" | "fail";
  summary: string;
}

export interface GenerateVideoResponse {
  artifacts: {
    finalVideo: GeneratedStorageObject;
    sceneClips?: GeneratedStorageObject[] | undefined;
    sceneImages: GeneratedStorageObject[];
    script: GeneratedStorageObject;
    soundEffects: GeneratedStorageObject;
    storyboard: GeneratedStorageObject;
    subtitles: GeneratedStorageObject;
    voiceover: GeneratedStorageObject;
  };
  costRM: number;
  durationSeconds: number;
  jobId: string;
  script: GeneratedScript;
  status: "COMPOSED";
  storyboard: GeneratedStoryboardScene[];
  storage: {
    driver: "local" | "gcs";
    fallbackReason?: string | undefined;
    rootPath?: string | undefined;
  };
}

export interface GeneratedImageAsset {
  asset: GeneratedStorageObject;
  costRM: number;
  prompt: string;
  qualityCheck?: GeneratedImageQualityCheck | undefined;
  referenceImage?: GeneratedStorageObject | undefined;
  revisedPrompt?: string | undefined;
  sceneId: number;
  usage?: CostLogUsage | undefined;
}

export interface GenerateImagesResponse {
  costRM: number;
  images: GeneratedImageAsset[];
  jobId: string;
  model: string;
  provider: string;
  referenceImage?: GeneratedStorageObject | undefined;
  requiresReview: boolean;
  status: "IMAGE_DONE";
  visualBible: GeneratedVisualBible;
}

export interface GenerateSceneImageResponse {
  costRM: number;
  image: GeneratedImageAsset;
  jobId: string;
  model: string;
  provider: string;
  referenceImage?: GeneratedStorageObject | undefined;
  requiresReview: boolean;
  status: "IMAGE_DONE";
  visualBible: GeneratedVisualBible;
}

export type ReferenceDesignType = "character_design" | "scene_design";

export interface GenerateReferenceDesignRequest extends ToolProviderOverride {
  costLimitRM: number;
  designType: ReferenceDesignType;
  jobId?: string | undefined;
  language: "zh-CN" | "en-US";
  prompt: string;
  sceneCount: number;
  sceneId?: number | undefined;
  templateType: ContentTemplateType;
  topic: string;
}

export interface GenerateReferenceDesignResponse {
  asset: GeneratedStorageObject;
  costRM: number;
  designType: ReferenceDesignType;
  jobId: string;
  model: string;
  prompt: string;
  provider: string;
  role: "reference_image";
  sceneId?: number | undefined;
  status: "REFERENCE_DONE";
  usage?: CostLogUsage | undefined;
  visualBible: GeneratedVisualBible;
}

export interface GenerateTtsResponse {
  audio: GeneratedStorageObject;
  costRM: number;
  format: string;
  jobId: string;
  model: string;
  provider: string;
  status: "TTS_DONE";
  usage?: CostLogUsage | undefined;
  voice: string;
  voiceoverText: string;
}

export interface GenerateBgmResponse {
  audio: GeneratedStorageObject;
  costRM: number;
  durationSeconds: number;
  format: string;
  jobId: string;
  model: string;
  prompt: string;
  provider: string;
  songId?: string | undefined;
  status: "BGM_DONE";
  usage?: CostLogUsage | undefined;
}

export interface GenerateVideoClipResponse {
  clip: {
    asset: GeneratedStorageObject;
    costRM: number;
    durationSeconds: number;
    mode: "image-to-video" | "reference-to-video" | "text-to-video";
    prompt: string;
    referenceImageUrls?: string[] | undefined;
    sceneId: number;
    lastFrameImageUrl?: string | undefined;
    sourceImageUrl?: string | undefined;
    taskId: string;
  };
  costRM: number;
  fallbackReason?: string | undefined;
  jobId: string;
  model: string;
  provider: string;
  status: "VIDEO_DONE";
  usage?: CostLogUsage | undefined;
}

export interface GenerateScriptStoryResponse {
  artifacts: {
    script: GeneratedStorageObject;
    storyboard: GeneratedStorageObject;
    visualBible: GeneratedStorageObject;
  };
  backgroundMusic: GeneratedBackgroundMusicBrief;
  costRM: number;
  interpretedIdea: GeneratedInterpretedIdea;
  jobId: string;
  model: string;
  outlineQc: GeneratedOutlineQualityCheck;
  provider: string;
  requiresReview: boolean;
  script: GeneratedScript;
  status: "STORYBOARD_DONE";
  storyboard: GeneratedStoryboardScene[];
  usage?: {
    inputTokens: number;
    outputTokens: number;
    pricingMode?: "configured_rate" | "pricing_missing" | "token_usage" | undefined;
  } | undefined;
  visualBible: GeneratedVisualBible;
}

export type QcCheckStatus = "pass" | "warning" | "fail";

export interface QcCheck {
  detail: string;
  label: string;
  status: QcCheckStatus;
}

export interface GenerateQcReportRequest {
  actualCostRM: number;
  artifacts: {
    bgm?: string | undefined;
    finalVideo?: string | undefined;
    sceneImages: string[];
    subtitles?: string | undefined;
    voiceover?: string | undefined;
  };
  costLimitRM: number;
  jobId: string;
  sceneCount: number;
}

export interface GenerateQcReportResponse {
  checks: QcCheck[];
  durationSeconds?: number | undefined;
  jobId: string;
  passed: boolean;
  resolution?: string | undefined;
  status: "QC_PASSED" | "FAILED";
  summary: string;
  timestamp: string;
}

export interface TrendScanRequest {
  categoryId?: string | undefined;
  excludeKeywords?: string | undefined;
  includeKeywords?: string | undefined;
  language: "zh-CN" | "en-US";
  languageMode?: "loose" | "strict" | undefined;
  maxResults?: number | undefined;
  minVelocityScore?: number | undefined;
  minViews?: number | undefined;
  publishedWithinDays: number;
  query: string;
  regionCode: string;
  safeMode?: "standard" | "strict" | undefined;
}

export interface TrendVideoCandidate {
  categoryId?: string | undefined;
  channelTitle: string;
  commentCount: number;
  description?: string | undefined;
  durationSeconds: number;
  engagementRate: number;
  id: string;
  likeCount: number;
  matchedSignals: string[];
  publishedAt: string;
  thumbnailUrl: string;
  title: string;
  url: string;
  velocityScore: number;
  viewCount: number;
}

export interface TrendAppliedFilters {
  categoryId?: string | undefined;
  excludeKeywords: string[];
  includeKeywords: string[];
  languageMode: "loose" | "strict";
  minVelocityScore: number;
  minViews: number;
  safeMode: "standard" | "strict";
}

export interface TrendFilterSummary {
  count: number;
  reason: string;
}

export interface TrendFilteredVideo {
  id: string;
  reason: string;
  title: string;
}

export interface TrendPattern {
  count: number;
  evidenceVideoIds: string[];
  label: string;
  score: number;
  summary: string;
}

export interface TrendIdeaSeed {
  angle: string;
  confidence: number;
  evidenceVideoIds: string[];
  genre: string;
  hook: string;
  topic: string;
  whyNow: string;
}

export interface TrendScanResponse {
  blocker?: string | undefined;
  filteredOut: TrendFilteredVideo[];
  filterSummary: TrendFilterSummary[];
  filters: TrendAppliedFilters;
  ideaSeeds: TrendIdeaSeed[];
  maxShortSeconds: number;
  patterns: TrendPattern[];
  provider: "youtube";
  publishedAfter: string;
  query: string;
  quotaUnits: number;
  regionCode: string;
  scannedAt: string;
  status: "ready" | "blocked";
  videos: TrendVideoCandidate[];
}
