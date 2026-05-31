import { contentTemplateTypes, type ContentTemplateType, type GenerateQcReportResponse, type ToolCostMode, type ToolProviderOverride, type TrendScanResponse } from "@ai-content-factory/shared-types";
import { createId } from "./ids.js";
import { readJson, writeJson } from "./local-storage.js";
import { isDemoCaseId } from "./jobs.js";
import { type ProductionStageId } from "./production.js";

export type TemplateType = ContentTemplateType;
export type ContentLanguage = "zh-CN" | "en-US";

export interface YouTubeAccount {
  id: string;
  channelName: string;
  youtubeChannelId: string;
  status: "connected" | "needs_reconnect";
  defaultPrivacy: "private";
  connectedAt: string;
  updatedAt: string;
}

export interface PublishingTarget {
  id: string;
  accountId: string;
  channelName: string;
  youtubeChannelId: string;
  enabled: boolean;
  dailyQuota: number;
  defaultPrivacy: "private";
  niche: string;
  language: ContentLanguage;
  templateType: TemplateType;
  uploadWindow: string;
  updatedAt: string;
}

export type CasePublishTargetStatus = "pending_review" | "approved" | "uploading" | "uploaded_private" | "failed";

export interface CasePublishTarget {
  id: string;
  jobId: string;
  targetId: string;
  status: CasePublishTargetStatus;
  privacyStatus: "private";
  youtubeVideoId: string | null;
  approvedAt: string | null;
  uploadedAt: string | null;
  retryCount: number;
  error: string | null;
  updatedAt: string;
}

export interface ProductionSchedule {
  id: string;
  name: string;
  enabled: boolean;
  timezone: string;
  daysOfWeek: number[];
  startTime: string;
  maxCasesPerRun: number;
  maxVideosPerDay: number;
  budgetLimitRM: number;
  approvalGate: "mp4_review";
  targetIds: string[];
  nextRunAt: string;
  lastRunAt: string | null;
}

export interface ScheduleRun {
  id: string;
  scheduleId: string;
  status: "completed" | "blocked" | "failed";
  plannedCaseCount: number;
  createdCaseIds: string[];
  startedAt: string;
  finishedAt: string;
  error: string | null;
}

export interface StorageSettings {
  driver: "gcs" | "minio" | "local";
  gcpProjectId: string;
  gcsBucket: string;
  gcsPrefix: string;
  localUploadsPath: string;
  minioBucket: string;
}

export interface StoredVideo {
  id: string;
  jobId: string;
  title: string;
  durationSeconds: number;
  resolution: "1080x1920";
  status: "draft" | "ready_to_upload" | "uploaded_private";
  publicUrl?: string | undefined;
  storagePath: string;
  costRM: number;
  createdAt: string;
}

export interface CharacterProfile {
  id: string;
  name: string;
  status: "draft" | "approved" | "retired";
  genre: TemplateType | "multi_genre";
  visualIdentity: string;
  outfitLock: string;
  styleLock: string;
  referenceImageUrl: string;
  voiceProfile: string;
  notes: string;
  createdAt: string;
  updatedAt: string;
}

export interface CaseQcReport extends GenerateQcReportResponse {
  id: string;
}

export interface WorkflowStep {
  id: string;
  order: number;
  stage: string;
  worker: string;
  queueName: string;
  toolId: string;
  output: string;
}

export interface AiToolEndpoint {
  id: string;
  stageIds: ProductionStageId[];
  stage: string;
  provider: string;
  role: string;
  endpoint: string;
  localPort: string;
  queueName: string;
  envKeys: string;
  costMode: string;
  status: "needs_setup" | "ready" | "disabled";
  enabled: boolean;
}

export type ToolProviderType = "llm" | "image" | "design_image" | "tts" | "bgm" | "video" | "subtitle" | "compose" | "storage" | "youtube";

export interface ToolProviderSettings {
  id: string;
  toolType: ToolProviderType;
  provider: string;
  apiStyle: string;
  baseUrl: string;
  model: string;
  enabled: boolean;
  allowAutopilot: boolean;
  params: Record<string, boolean | number | string>;
  costMode: ToolCostMode;
  inputUnitPriceRM: number;
  outputUnitPriceRM: number;
  fallbackCostRM: number;
  retryLimit: number;
  updatedAt: string;
}

export interface ToolProviderPreset {
  id: string;
  label: string;
  provider: string;
  apiStyle: string;
  baseUrl: string;
  defaultModel: string;
  models: string[];
  params: Record<string, boolean | number | string>;
  costMode: ToolCostMode;
  retryLimit: number;
}

export const openAILlmModels = [
  "gpt-5.2",
  "gpt-5.2-pro",
  "gpt-5.1",
  "gpt-5",
  "gpt-5-mini",
  "gpt-5-nano",
  "gpt-4.1",
  "gpt-4.1-mini",
  "gpt-4o-mini"
] as const;

export const openAIImageModels = ["gpt-image-1.5", "gpt-image-1", "gpt-image-2"] as const;

export const openAITtsModels = ["gpt-4o-mini-tts", "tts-1", "tts-1-hd"] as const;

export interface ProviderKeyRecord {
  id: string;
  provider: string;
  service: string;
  keyName: string;
  status: "missing" | "configured" | "needs_rotation";
  lastFour: string;
  updatedAt: string | null;
  enabled: boolean;
}

export interface TrendReport extends TrendScanResponse {
  id: string;
  savedAt: string;
}

const accountsKey = "ai-content-factory:youtube-accounts";
const storageSettingsKey = "ai-content-factory:storage-settings";
const videosKey = "ai-content-factory:stored-videos";
const aiToolEndpointsKey = "ai-content-factory:ai-tool-endpoints";
const toolProviderSettingsKey = "ai-content-factory:tool-provider-settings";
const providerKeysKey = "ai-content-factory:provider-keys";
const publishingTargetsKey = "ai-content-factory:publishing-targets";
const casePublishTargetsKey = "ai-content-factory:case-publish-targets";
const productionSchedulesKey = "ai-content-factory:production-schedules";
const scheduleRunsKey = "ai-content-factory:schedule-runs";
const characterProfilesKey = "ai-content-factory:character-profiles";
const trendReportsKey = "ai-content-factory:trend-reports";
const legacyGenreCharacterNames = new Set([
  "恐怖规则",
  "监控悬疑",
  "都市传说",
  "喜剧短剧",
  "爱情故事",
  "童话故事"
]);
const qcReportsKey = "ai-content-factory:qc-reports";

export const customToolModelValue = "__custom_model__";
export const customToolProviderValue = "__custom_provider__";

const toolProviderPresets: Record<ToolProviderType, ToolProviderPreset[]> = {
  bgm: [
    {
      apiStyle: "elevenlabs-music",
      baseUrl: "https://api.elevenlabs.io/v1",
      costMode: "credit",
      defaultModel: "music_v1",
      id: "bgm_elevenlabs",
      label: "ElevenLabs Music",
      models: ["music_v1"],
      params: { outputFormat: "mp3_44100_128" },
      provider: "elevenlabs",
      retryLimit: 1
    },
    {
      apiStyle: "custom-music-api",
      baseUrl: "",
      costMode: "custom",
      defaultModel: "custom-music-model",
      id: "bgm_custom",
      label: "自定义音乐 API",
      models: ["custom-music-model"],
      params: {},
      provider: "custom-music-api",
      retryLimit: 1
    }
  ],
  compose: [
    {
      apiStyle: "ffmpeg",
      baseUrl: "local://ffmpeg",
      costMode: "free",
      defaultModel: "ffmpeg-local",
      id: "compose_ffmpeg",
      label: "本地 FFmpeg",
      models: ["ffmpeg-local"],
      params: { fps: 30, resolution: "1080x1920" },
      provider: "local",
      retryLimit: 0
    }
  ],
  design_image: [
    {
      apiStyle: "openai-images",
      baseUrl: "https://api.openai.com/v1",
      costMode: "image",
      defaultModel: "gpt-image-1.5",
      id: "design_openai",
      label: "OpenAI Images",
      models: [...openAIImageModels],
      params: { quality: "high", size: "1024x1536" },
      provider: "openai",
      retryLimit: 2
    },
    {
      apiStyle: "fal-image",
      baseUrl: "https://fal.run",
      costMode: "image",
      defaultModel: "fal/flux-pro",
      id: "design_fal",
      label: "fal",
      models: ["fal/flux-pro", "fal/flux/dev", "fal/imagen4/preview"],
      params: { size: "1024x1536" },
      provider: "fal",
      retryLimit: 2
    },
    {
      apiStyle: "replicate-image",
      baseUrl: "https://api.replicate.com/v1",
      costMode: "image",
      defaultModel: "black-forest-labs/flux-1.1-pro",
      id: "design_replicate",
      label: "Replicate",
      models: ["black-forest-labs/flux-1.1-pro", "ideogram-ai/ideogram-v3-turbo"],
      params: { aspectRatio: "9:16" },
      provider: "replicate",
      retryLimit: 2
    },
    {
      apiStyle: "custom-image-api",
      baseUrl: "",
      costMode: "custom",
      defaultModel: "custom-design-model",
      id: "design_custom",
      label: "自定义设计图 API",
      models: ["custom-design-model"],
      params: {},
      provider: "custom-design-api",
      retryLimit: 2
    }
  ],
  image: [
    {
      apiStyle: "openai-images",
      baseUrl: "https://api.openai.com/v1",
      costMode: "image",
      defaultModel: "gpt-image-1.5",
      id: "image_openai",
      label: "OpenAI Images",
      models: [...openAIImageModels],
      params: { quality: "medium", size: "1024x1536" },
      provider: "openai",
      retryLimit: 2
    },
    {
      apiStyle: "fal-image",
      baseUrl: "https://fal.run",
      costMode: "image",
      defaultModel: "fal/flux-pro",
      id: "image_fal",
      label: "fal",
      models: ["fal/flux-pro", "fal/flux/dev", "fal/imagen4/preview"],
      params: { size: "1024x1536" },
      provider: "fal",
      retryLimit: 2
    },
    {
      apiStyle: "replicate-image",
      baseUrl: "https://api.replicate.com/v1",
      costMode: "image",
      defaultModel: "black-forest-labs/flux-1.1-pro",
      id: "image_replicate",
      label: "Replicate",
      models: ["black-forest-labs/flux-1.1-pro", "ideogram-ai/ideogram-v3-turbo"],
      params: { aspectRatio: "9:16" },
      provider: "replicate",
      retryLimit: 2
    },
    {
      apiStyle: "custom-image-api",
      baseUrl: "",
      costMode: "custom",
      defaultModel: "custom-image-model",
      id: "image_custom",
      label: "自定义图片 API",
      models: ["custom-image-model"],
      params: {},
      provider: "custom-image-api",
      retryLimit: 2
    }
  ],
  llm: [
    {
      apiStyle: "openai-responses",
      baseUrl: "https://api.openai.com/v1",
      costMode: "tokens",
      defaultModel: "gpt-5.2",
      id: "llm_openai",
      label: "OpenAI",
      models: [...openAILlmModels],
      params: { maxOutputTokens: 3200 },
      provider: "openai",
      retryLimit: 1
    },
    {
      apiStyle: "openai-compatible-chat",
      baseUrl: "https://api.deepseek.com",
      costMode: "tokens",
      defaultModel: "deepseek-chat",
      id: "llm_deepseek",
      label: "DeepSeek",
      models: ["deepseek-chat", "deepseek-reasoner"],
      params: { maxOutputTokens: 3200 },
      provider: "deepseek",
      retryLimit: 1
    },
    {
      apiStyle: "gemini-generate-content",
      baseUrl: "https://generativelanguage.googleapis.com",
      costMode: "tokens",
      defaultModel: "gemini-2.0-flash",
      id: "llm_gemini",
      label: "Gemini",
      models: ["gemini-2.0-flash", "gemini-1.5-pro"],
      params: { maxOutputTokens: 3200 },
      provider: "gemini",
      retryLimit: 1
    },
    {
      apiStyle: "openai-compatible-chat",
      baseUrl: "",
      costMode: "custom",
      defaultModel: "custom-chat-model",
      id: "llm_custom",
      label: "自定义兼容 API",
      models: ["custom-chat-model"],
      params: { maxOutputTokens: 3200 },
      provider: "custom-llm-api",
      retryLimit: 1
    }
  ],
  storage: [
    {
      apiStyle: "local-uploads",
      baseUrl: "local://uploads",
      costMode: "free",
      defaultModel: "local-uploads",
      id: "storage_local",
      label: "本地 uploads",
      models: ["local-uploads"],
      params: { driver: "local" },
      provider: "local",
      retryLimit: 0
    },
    {
      apiStyle: "gcs",
      baseUrl: "https://storage.googleapis.com",
      costMode: "custom",
      defaultModel: "gcs-bucket",
      id: "storage_gcs",
      label: "Google Cloud Storage",
      models: ["gcs-bucket"],
      params: { driver: "gcs" },
      provider: "gcs",
      retryLimit: 1
    },
    {
      apiStyle: "s3-compatible",
      baseUrl: "http://minio:9000",
      costMode: "custom",
      defaultModel: "minio-bucket",
      id: "storage_minio",
      label: "MinIO / S3",
      models: ["minio-bucket"],
      params: { driver: "minio" },
      provider: "minio",
      retryLimit: 1
    }
  ],
  subtitle: [
    {
      apiStyle: "local-worker",
      baseUrl: "local://subtitle-worker",
      costMode: "free",
      defaultModel: "local-srt",
      id: "subtitle_local",
      label: "本地字幕 Worker",
      models: ["local-srt", "local-ass"],
      params: { format: "srt" },
      provider: "local",
      retryLimit: 0
    }
  ],
  tts: [
    {
      apiStyle: "openai-tts",
      baseUrl: "https://api.openai.com/v1",
      costMode: "character",
      defaultModel: "gpt-4o-mini-tts",
      id: "tts_openai",
      label: "OpenAI TTS",
      models: [...openAITtsModels],
      params: { format: "mp3", voice: "verse" },
      provider: "openai",
      retryLimit: 1
    },
    {
      apiStyle: "elevenlabs-tts",
      baseUrl: "https://api.elevenlabs.io/v1",
      costMode: "character",
      defaultModel: "eleven_multilingual_v2",
      id: "tts_elevenlabs",
      label: "ElevenLabs TTS",
      models: ["eleven_multilingual_v2", "eleven_flash_v2_5", "eleven_turbo_v2_5"],
      params: { format: "mp3_44100_128" },
      provider: "elevenlabs",
      retryLimit: 1
    },
    {
      apiStyle: "custom-tts-api",
      baseUrl: "",
      costMode: "custom",
      defaultModel: "custom-tts-model",
      id: "tts_custom",
      label: "自定义 TTS API",
      models: ["custom-tts-model"],
      params: {},
      provider: "custom-tts-api",
      retryLimit: 1
    }
  ],
  video: [
    {
      apiStyle: "byteplus-ark",
      baseUrl: "https://ark.ap-southeast.bytepluses.com/api/v3",
      costMode: "tokens",
      defaultModel: "dreamina-seedance-2-0-260128",
      id: "video_seedance",
      label: "BytePlus Seedance",
      models: ["dreamina-seedance-2-0-260128", "dreamina-seedance-2-0-fast"],
      params: { aspectRatio: "9:16", quality: "720p" },
      provider: "seedance",
      retryLimit: 0
    },
    {
      apiStyle: "runway",
      baseUrl: "https://api.dev.runwayml.com/v1",
      costMode: "second",
      defaultModel: "gen4_turbo",
      id: "video_runway",
      label: "Runway",
      models: ["gen4_turbo", "gen3a_turbo"],
      params: { aspectRatio: "9:16", duration: 5 },
      provider: "runway",
      retryLimit: 0
    },
    {
      apiStyle: "minimax-video",
      baseUrl: "https://api.minimax.io/v1",
      costMode: "second",
      defaultModel: "video-01",
      id: "video_minimax",
      label: "MiniMax",
      models: ["video-01", "video-01-live"],
      params: { aspectRatio: "9:16", duration: 5 },
      provider: "minimax",
      retryLimit: 0
    },
    {
      apiStyle: "custom-video-api",
      baseUrl: "",
      costMode: "custom",
      defaultModel: "custom-video-model",
      id: "video_custom",
      label: "自定义视频 API",
      models: ["custom-video-model"],
      params: {},
      provider: "custom-video-api",
      retryLimit: 0
    }
  ],
  youtube: [
    {
      apiStyle: "youtube-data-v3",
      baseUrl: "https://www.googleapis.com",
      costMode: "credit",
      defaultModel: "youtube-upload-private",
      id: "youtube_data",
      label: "YouTube Data API",
      models: ["youtube-upload-private"],
      params: { privacy: "private" },
      provider: "youtube",
      retryLimit: 1
    }
  ]
};

const defaultYouTubeAccounts: YouTubeAccount[] = [];

const defaultPublishingTargets: PublishingTarget[] = [];
const defaultCharacterProfiles: CharacterProfile[] = [];

const defaultProductionSchedules: ProductionSchedule[] = [
  {
    id: "schedule_daily_shorts",
    name: "Daily Shorts Batch",
    enabled: true,
    timezone: "Asia/Kuala_Lumpur",
    daysOfWeek: [1, 2, 3, 4, 5, 6, 7],
    startTime: "09:00",
    maxCasesPerRun: 5,
    maxVideosPerDay: 10,
    budgetLimitRM: 80,
    approvalGate: "mp4_review",
    targetIds: [],
    nextRunAt: calculateNextRunAt({
      daysOfWeek: [1, 2, 3, 4, 5, 6, 7],
      startTime: "09:00"
    }),
    lastRunAt: null
  }
];

const defaultStorageSettings: StorageSettings = {
  driver: "gcs",
  gcpProjectId: "ai-content-factory-prod",
  gcsBucket: "ai-content-factory-videos",
  gcsPrefix: "shorts/final",
  localUploadsPath: "uploads",
  minioBucket: "content-factory"
};

const defaultProviderKeys: ProviderKeyRecord[] = [
  {
    id: "key_openai",
    provider: "OpenAI",
    service: "LLM, image, TTS voiceover",
    keyName: "OPENAI_API_KEY",
    status: "missing",
    lastFour: "",
    updatedAt: null,
    enabled: true
  },
  {
    id: "key_deepseek",
    provider: "DeepSeek",
    service: "Alternative LLM",
    keyName: "DEEPSEEK_API_KEY",
    status: "missing",
    lastFour: "",
    updatedAt: null,
    enabled: false
  },
  {
    id: "key_gemini",
    provider: "Gemini",
    service: "Alternative LLM",
    keyName: "GEMINI_API_KEY",
    status: "missing",
    lastFour: "",
    updatedAt: null,
    enabled: false
  },
  {
    id: "key_fal",
    provider: "fal",
    service: "Image / video generation",
    keyName: "FAL_API_KEY",
    status: "missing",
    lastFour: "",
    updatedAt: null,
    enabled: true
  },
  {
    id: "key_replicate",
    provider: "Replicate",
    service: "Alternative image provider",
    keyName: "REPLICATE_API_TOKEN",
    status: "missing",
    lastFour: "",
    updatedAt: null,
    enabled: false
  },
  {
    id: "key_runway",
    provider: "Runway",
    service: "Optional video API",
    keyName: "RUNWAY_API_KEY",
    status: "missing",
    lastFour: "",
    updatedAt: null,
    enabled: false
  },
  {
    id: "key_minimax",
    provider: "MiniMax",
    service: "Optional video API",
    keyName: "MINIMAX_API_KEY",
    status: "missing",
    lastFour: "",
    updatedAt: null,
    enabled: false
  },
  {
    id: "key_seedance",
    provider: "BytePlus ModelArk / Seedance 2.0",
    service: "Official video clips / image-to-video",
    keyName: "BYTEPLUS_ARK_API_KEY",
    status: "missing",
    lastFour: "",
    updatedAt: null,
    enabled: true
  },
  {
    id: "key_elevenlabs",
    provider: "ElevenLabs",
    service: "Music / BGM and optional TTS voiceover provider",
    keyName: "ELEVENLABS_API_KEY",
    status: "missing",
    lastFour: "",
    updatedAt: null,
    enabled: true
  },
  {
    id: "key_youtube_data",
    provider: "YouTube Data API",
    service: "Trend Radar research",
    keyName: "YOUTUBE_API_KEY",
    status: "missing",
    lastFour: "",
    updatedAt: null,
    enabled: true
  },
  {
    id: "key_youtube",
    provider: "YouTube OAuth",
    service: "Private upload",
    keyName: "YOUTUBE_REFRESH_TOKEN",
    status: "missing",
    lastFour: "",
    updatedAt: null,
    enabled: true
  },
  {
    id: "key_gcp",
    provider: "Google Cloud",
    service: "GCS video storage",
    keyName: "GOOGLE_APPLICATION_CREDENTIALS",
    status: "missing",
    lastFour: "",
    updatedAt: null,
    enabled: true
  }
];

export const workflowSteps: WorkflowStep[] = [
  {
    id: "workflow_script",
    order: 1,
    stage: "Script",
    worker: "script-worker",
    queueName: "script.queue",
    toolId: "tool_llm",
    output: "script document"
  },
  {
    id: "workflow_storyboard",
    order: 2,
    stage: "Storyboard",
    worker: "storyboard-worker",
    queueName: "storyboard.queue",
    toolId: "tool_llm",
    output: "scene list"
  },
  {
    id: "workflow_image",
    order: 3,
    stage: "Image",
    worker: "image-worker",
    queueName: "image.queue",
    toolId: "tool_image",
    output: "scene images"
  },
  {
    id: "workflow_video",
    order: 4,
    stage: "Video optional",
    worker: "video-worker",
    queueName: "video.queue",
    toolId: "tool_video",
    output: "motion clips"
  },
  {
    id: "workflow_tts",
    order: 5,
    stage: "TTS",
    worker: "tts-worker",
    queueName: "tts.queue",
    toolId: "tool_tts",
    output: "voiceover audio"
  },
  {
    id: "workflow_bgm",
    order: 6,
    stage: "BGM",
    worker: "bgm-worker",
    queueName: "bgm.queue",
    toolId: "tool_music",
    output: "background music"
  },
  {
    id: "workflow_subtitle",
    order: 7,
    stage: "Subtitle",
    worker: "subtitle-worker",
    queueName: "subtitle.queue",
    toolId: "tool_subtitle",
    output: "SRT / ASS subtitles"
  },
  {
    id: "workflow_compose",
    order: 8,
    stage: "Compose",
    worker: "compose-worker",
    queueName: "compose.queue",
    toolId: "tool_compose",
    output: "final MP4"
  },
  {
    id: "workflow_upload",
    order: 9,
    stage: "Upload",
    worker: "publisher-worker",
    queueName: "publish.queue",
    toolId: "tool_youtube",
    output: "YouTube private video"
  },
  {
    id: "workflow_storage",
    order: 10,
    stage: "Archive",
    worker: "storage package",
    queueName: "storage.write",
    toolId: "tool_storage",
    output: "GCS object"
  }
];

const defaultAiToolEndpoints: AiToolEndpoint[] = [
  {
    id: "tool_llm",
    stageIds: ["script", "storyboard", "prompt"],
    stage: "Script / Storyboard / Metadata",
    provider: "OpenAI / DeepSeek / Gemini",
    role: "LLM generation",
    endpoint: "https://api.openai.com/v1",
    localPort: "4101",
    queueName: "script.queue, storyboard.queue",
    envKeys: "OPENAI_API_KEY, DEEPSEEK_API_KEY, GEMINI_API_KEY",
    costMode: "tokens",
    status: "needs_setup",
    enabled: true
  },
  {
    id: "tool_image",
    stageIds: ["image"],
    stage: "Image generation",
    provider: "fal / Replicate / OpenAI Images",
    role: "Generate scene stills",
    endpoint: "https://fal.run",
    localPort: "4103",
    queueName: "image.queue",
    envKeys: "FAL_API_KEY, REPLICATE_API_TOKEN, OPENAI_API_KEY",
    costMode: "per image",
    status: "needs_setup",
    enabled: true
  },
  {
    id: "tool_video",
    stageIds: ["video"],
    stage: "Video generation",
    provider: "Seedance 2.0 / Runway / MiniMax",
    role: "Optional motion clips",
    endpoint: "https://api.evolink.ai/v1/videos/generations",
    localPort: "4104",
    queueName: "video.queue",
    envKeys: "BYTEPLUS_ARK_API_KEY, SEEDANCE_MODEL, SEEDANCE_IMAGE_TO_VIDEO_MODEL, SEEDANCE_TEXT_TO_VIDEO_MODEL, RUNWAY_API_KEY",
    costMode: "per second",
    status: "needs_setup",
    enabled: true
  },
  {
    id: "tool_tts",
    stageIds: ["tts"],
    stage: "Voiceover",
    provider: "OpenAI TTS / ElevenLabs",
    role: "Generate narration audio",
    endpoint: "https://api.openai.com/v1/audio/speech",
    localPort: "4105",
    queueName: "tts.queue",
    envKeys: "OPENAI_API_KEY, OPENAI_TTS_MODEL, OPENAI_TTS_VOICE, ELEVENLABS_API_KEY",
    costMode: "characters / audio output",
    status: "needs_setup",
    enabled: true
  },
  {
    id: "tool_music",
    stageIds: ["bgm"],
    stage: "Background music",
    provider: "ElevenLabs Music",
    role: "Generate instrumental BGM",
    endpoint: "https://api.elevenlabs.io/v1/music",
    localPort: "4110",
    queueName: "bgm.queue",
    envKeys: "ELEVENLABS_API_KEY, ELEVENLABS_MUSIC_MODEL, ELEVENLABS_MUSIC_OUTPUT_FORMAT",
    costMode: "credits / duration",
    status: "needs_setup",
    enabled: true
  },
  {
    id: "tool_subtitle",
    stageIds: ["subtitle"],
    stage: "Subtitle",
    provider: "Local subtitle worker",
    role: "Create simple SRT / ASS",
    endpoint: "local://subtitle-worker",
    localPort: "4106",
    queueName: "subtitle.queue",
    envKeys: "none",
    costMode: "free",
    status: "ready",
    enabled: true
  },
  {
    id: "tool_compose",
    stageIds: ["compose"],
    stage: "FFmpeg compose",
    provider: "Local FFmpeg",
    role: "Render vertical MP4",
    endpoint: "local://ffmpeg",
    localPort: "4107",
    queueName: "compose.queue",
    envKeys: "FFMPEG_PATH",
    costMode: "compute",
    status: "ready",
    enabled: true
  },
  {
    id: "tool_youtube",
    stageIds: ["publish"],
    stage: "YouTube upload",
    provider: "YouTube Data API",
    role: "Private upload only",
    endpoint: "https://www.googleapis.com/upload/youtube/v3",
    localPort: "4108",
    queueName: "publish.queue",
    envKeys: "YOUTUBE_CLIENT_ID, YOUTUBE_CLIENT_SECRET, YOUTUBE_REFRESH_TOKEN",
    costMode: "quota units",
    status: "needs_setup",
    enabled: true
  },
  {
    id: "tool_storage",
    stageIds: ["archive"],
    stage: "Video storage",
    provider: "Google Cloud Storage",
    role: "Store final MP4 and assets",
    endpoint: "https://storage.googleapis.com",
    localPort: "4109",
    queueName: "storage.write",
    envKeys: "GCP_PROJECT_ID, GCS_BUCKET, GOOGLE_APPLICATION_CREDENTIALS",
    costMode: "storage / egress",
    status: "needs_setup",
    enabled: true
  }
];

const defaultToolProviderSettings: ToolProviderSettings[] = [
  {
    allowAutopilot: true,
    apiStyle: "openai-responses",
    baseUrl: "https://api.openai.com/v1",
    costMode: "tokens",
    enabled: true,
    fallbackCostRM: 0,
    id: "tool_settings_llm",
    inputUnitPriceRM: 0,
    model: "gpt-5.2",
    outputUnitPriceRM: 0,
    params: { maxOutputTokens: 3200 },
    provider: "openai",
    retryLimit: 1,
    toolType: "llm",
    updatedAt: new Date(0).toISOString()
  },
  {
    allowAutopilot: true,
    apiStyle: "openai-images",
    baseUrl: "https://api.openai.com/v1",
    costMode: "image",
    enabled: true,
    fallbackCostRM: 0,
    id: "tool_settings_image",
    inputUnitPriceRM: 0,
    model: "gpt-image-1.5",
    outputUnitPriceRM: 0,
    params: { quality: "medium", size: "1024x1536" },
    provider: "openai",
    retryLimit: 2,
    toolType: "image",
    updatedAt: new Date(0).toISOString()
  },
  {
    allowAutopilot: true,
    apiStyle: "openai-images",
    baseUrl: "https://api.openai.com/v1",
    costMode: "image",
    enabled: true,
    fallbackCostRM: 0,
    id: "tool_settings_design_image",
    inputUnitPriceRM: 0,
    model: "gpt-image-1.5",
    outputUnitPriceRM: 0,
    params: { quality: "high", size: "1024x1536" },
    provider: "openai",
    retryLimit: 2,
    toolType: "design_image",
    updatedAt: new Date(0).toISOString()
  },
  {
    allowAutopilot: true,
    apiStyle: "openai-tts",
    baseUrl: "https://api.openai.com/v1",
    costMode: "character",
    enabled: true,
    fallbackCostRM: 0,
    id: "tool_settings_tts",
    inputUnitPriceRM: 0,
    model: "gpt-4o-mini-tts",
    outputUnitPriceRM: 0,
    params: { format: "mp3", voice: "verse" },
    provider: "openai",
    retryLimit: 1,
    toolType: "tts",
    updatedAt: new Date(0).toISOString()
  },
  {
    allowAutopilot: false,
    apiStyle: "elevenlabs-music",
    baseUrl: "https://api.elevenlabs.io/v1",
    costMode: "credit",
    enabled: true,
    fallbackCostRM: 0,
    id: "tool_settings_bgm",
    inputUnitPriceRM: 0,
    model: "music_v1",
    outputUnitPriceRM: 0,
    params: { outputFormat: "mp3_44100_128" },
    provider: "elevenlabs",
    retryLimit: 1,
    toolType: "bgm",
    updatedAt: new Date(0).toISOString()
  },
  {
    allowAutopilot: false,
    apiStyle: "byteplus-ark",
    baseUrl: "https://ark.ap-southeast.bytepluses.com/api/v3",
    costMode: "tokens",
    enabled: true,
    fallbackCostRM: 0,
    id: "tool_settings_video",
    inputUnitPriceRM: 0,
    model: "dreamina-seedance-2-0-260128",
    outputUnitPriceRM: 0,
    params: { aspectRatio: "9:16", quality: "720p" },
    provider: "seedance",
    retryLimit: 0,
    toolType: "video",
    updatedAt: new Date(0).toISOString()
  },
  {
    allowAutopilot: true,
    apiStyle: "local-worker",
    baseUrl: "local://subtitle-worker",
    costMode: "free",
    enabled: true,
    fallbackCostRM: 0,
    id: "tool_settings_subtitle",
    inputUnitPriceRM: 0,
    model: "local-srt",
    outputUnitPriceRM: 0,
    params: { format: "srt" },
    provider: "local",
    retryLimit: 0,
    toolType: "subtitle",
    updatedAt: new Date(0).toISOString()
  },
  {
    allowAutopilot: true,
    apiStyle: "ffmpeg",
    baseUrl: "local://ffmpeg",
    costMode: "free",
    enabled: true,
    fallbackCostRM: 0,
    id: "tool_settings_compose",
    inputUnitPriceRM: 0,
    model: "ffmpeg-local",
    outputUnitPriceRM: 0,
    params: { fps: 30, resolution: "1080x1920" },
    provider: "local",
    retryLimit: 0,
    toolType: "compose",
    updatedAt: new Date(0).toISOString()
  },
  {
    allowAutopilot: true,
    apiStyle: "local-uploads",
    baseUrl: "local://uploads",
    costMode: "free",
    enabled: true,
    fallbackCostRM: 0,
    id: "tool_settings_storage",
    inputUnitPriceRM: 0,
    model: "local-uploads",
    outputUnitPriceRM: 0,
    params: { driver: "local" },
    provider: "local",
    retryLimit: 0,
    toolType: "storage",
    updatedAt: new Date(0).toISOString()
  },
  {
    allowAutopilot: false,
    apiStyle: "youtube-data-v3",
    baseUrl: "https://www.googleapis.com",
    costMode: "credit",
    enabled: true,
    fallbackCostRM: 0,
    id: "tool_settings_youtube",
    inputUnitPriceRM: 0,
    model: "youtube-upload-private",
    outputUnitPriceRM: 0,
    params: { privacy: "private" },
    provider: "youtube",
    retryLimit: 1,
    toolType: "youtube",
    updatedAt: new Date(0).toISOString()
  }
];

export function loadYouTubeAccounts(): YouTubeAccount[] {
  const accounts = readJson(accountsKey, defaultYouTubeAccounts).filter((account) => !account.id.startsWith("yt_demo_") && account.youtubeChannelId !== "UC_demo_private");

  writeJson(accountsKey, accounts);
  return accounts;
}

export function saveYouTubeAccounts(accounts: YouTubeAccount[]): void {
  writeJson(accountsKey, accounts);
}

export function createYouTubeAccount(channelName: string, youtubeChannelId: string): YouTubeAccount {
  const now = new Date().toISOString();

  return {
    id: createId("yt"),
    channelName,
    youtubeChannelId,
    status: "needs_reconnect",
    defaultPrivacy: "private",
    connectedAt: now,
    updatedAt: now
  };
}

export function loadPublishingTargets(accounts: YouTubeAccount[] = loadYouTubeAccounts()): PublishingTarget[] {
  const accountIds = new Set(accounts.map((account) => account.id));
  const targets = readJson<PublishingTarget[]>(publishingTargetsKey, defaultPublishingTargets);
  const normalizedTargets = normalizePublishingTargets(targets).filter(
    (target) =>
      target.id !== "target_night_rules_horror" &&
      target.youtubeChannelId !== "UC_demo_private" &&
      target.youtubeChannelId !== "UC_missing" &&
      target.youtubeChannelId.trim() &&
      accountIds.has(target.accountId)
  );

  if (normalizedTargets.length !== targets.length) {
    writeJson(publishingTargetsKey, normalizedTargets);
  }

  return normalizedTargets;
}

export function savePublishingTargets(targets: PublishingTarget[]): void {
  writeJson(publishingTargetsKey, normalizePublishingTargets(targets));
}

export function createPublishingTarget(input: {
  accountId: string;
  channelName: string;
  youtubeChannelId: string;
  niche?: string;
  language?: ContentLanguage;
  templateType?: TemplateType;
}): PublishingTarget {
  return {
    accountId: input.accountId,
    channelName: input.channelName,
    dailyQuota: 5,
    defaultPrivacy: "private",
    enabled: true,
    id: createId("target"),
    language: input.language ?? "zh-CN",
    niche: input.niche ?? input.templateType ?? "general_shorts",
    templateType: input.templateType ?? "rules_horror",
    updatedAt: new Date().toISOString(),
    uploadWindow: "18:00-23:00",
    youtubeChannelId: input.youtubeChannelId
  };
}

export function loadCasePublishTargets(activeJobIds: string[]): CasePublishTarget[] {
  const jobIds = new Set(activeJobIds);
  const targets = readJson<CasePublishTarget[]>(casePublishTargetsKey, []);
  const normalizedTargets = targets.filter((target) => jobIds.has(target.jobId) && !isDemoCaseId(target.jobId)).map(normalizeCasePublishTarget);

  if (normalizedTargets.length !== targets.length) {
    writeJson(casePublishTargetsKey, normalizedTargets);
  }

  return normalizedTargets;
}

export function saveCasePublishTargets(targets: CasePublishTarget[]): void {
  writeJson(casePublishTargetsKey, targets.map(normalizeCasePublishTarget));
}

export function createCasePublishTargets(jobId: string, targetIds: string[]): CasePublishTarget[] {
  const now = new Date().toISOString();

  return targetIds.map((targetId) => ({
    approvedAt: null,
    error: null,
    id: `${jobId}_${targetId}`,
    jobId,
    privacyStatus: "private",
    retryCount: 0,
    status: "pending_review",
    targetId,
    updatedAt: now,
    uploadedAt: null,
    youtubeVideoId: null
  }));
}

export function loadProductionSchedules(targets: PublishingTarget[] = loadPublishingTargets()): ProductionSchedule[] {
  const targetIds = new Set(targets.map((target) => target.id));
  const schedules = readJson<ProductionSchedule[]>(productionSchedulesKey, defaultProductionSchedules);
  const normalizedSchedules = schedules.map((schedule) => normalizeProductionSchedule(schedule, targetIds));

  if (JSON.stringify(normalizedSchedules) !== JSON.stringify(schedules)) {
    writeJson(productionSchedulesKey, normalizedSchedules);
  }

  return normalizedSchedules;
}

export function saveProductionSchedules(schedules: ProductionSchedule[]): void {
  writeJson(productionSchedulesKey, schedules.map((schedule) => normalizeProductionSchedule(schedule)));
}

export function loadScheduleRuns(schedules: ProductionSchedule[] = loadProductionSchedules()): ScheduleRun[] {
  const scheduleIds = new Set(schedules.map((schedule) => schedule.id));
  const runs = readJson<ScheduleRun[]>(scheduleRunsKey, []);
  const normalizedRuns = runs.filter((run) => scheduleIds.has(run.scheduleId)).map(normalizeScheduleRun);

  if (normalizedRuns.length !== runs.length) {
    writeJson(scheduleRunsKey, normalizedRuns);
  }

  return normalizedRuns;
}

export function saveScheduleRuns(runs: ScheduleRun[]): void {
  writeJson(scheduleRunsKey, runs.map(normalizeScheduleRun));
}

export function createScheduleRun(input: {
  scheduleId: string;
  status: ScheduleRun["status"];
  plannedCaseCount: number;
  createdCaseIds: string[];
  startedAt?: string;
  finishedAt?: string;
  error?: string | null;
}): ScheduleRun {
  const now = new Date().toISOString();

  return {
    createdCaseIds: input.createdCaseIds,
    error: input.error ?? null,
    finishedAt: input.finishedAt ?? now,
    id: createId("run"),
    plannedCaseCount: input.plannedCaseCount,
    scheduleId: input.scheduleId,
    startedAt: input.startedAt ?? now,
    status: input.status
  };
}

export function loadStorageSettings(): StorageSettings {
  const settings = readJson(storageSettingsKey, defaultStorageSettings);
  return {
    ...settings,
    localUploadsPath: settings.localUploadsPath ?? "uploads"
  };
}

export function saveStorageSettings(settings: StorageSettings): void {
  writeJson(storageSettingsKey, settings);
}

export function loadStoredVideos(): StoredVideo[] {
  const videos = readJson<StoredVideo[]>(videosKey, []);
  const migratedVideos = videos.filter((video) => !video.id.startsWith("video_demo_") && !isDemoCaseId(video.jobId));

  if (migratedVideos.length !== videos.length) {
    writeJson(videosKey, migratedVideos);
  }

  return migratedVideos;
}

export function saveStoredVideos(videos: StoredVideo[]): void {
  writeJson(videosKey, videos);
}

export function loadTrendReports(): TrendReport[] {
  return readJson<TrendReport[]>(trendReportsKey, []).map(normalizeTrendReport);
}

export function saveTrendReports(reports: TrendReport[]): void {
  writeJson(trendReportsKey, reports.map(normalizeTrendReport).slice(0, 20));
}

export function createTrendReport(response: TrendScanResponse): TrendReport {
  return normalizeTrendReport({
    ...response,
    id: createId("trend"),
    savedAt: new Date().toISOString()
  });
}

export function loadCharacterProfiles(): CharacterProfile[] {
  const rawCharacters = readJson<CharacterProfile[]>(characterProfilesKey, defaultCharacterProfiles);
  const characters = rawCharacters.map(normalizeCharacterProfile).filter((character) => !isLegacyGenreCharacter(character));

  if (characters.length !== rawCharacters.length) {
    writeJson(characterProfilesKey, characters);
  }

  return characters;
}

export function saveCharacterProfiles(characters: CharacterProfile[]): void {
  writeJson(characterProfilesKey, characters.map(normalizeCharacterProfile));
}

export function createCharacterProfile(input?: Partial<CharacterProfile>): CharacterProfile {
  const now = new Date().toISOString();

  return normalizeCharacterProfile({
    createdAt: now,
    genre: "multi_genre",
    id: createId("character"),
    name: "New Character",
    notes: "",
    outfitLock: "",
    referenceImageUrl: "",
    status: "draft",
    styleLock: "consistent cinematic vertical Shorts style",
    updatedAt: now,
    visualIdentity: "Describe face, age range as adult, silhouette, hair, palette, and recurring visual marks.",
    voiceProfile: "",
    ...input
  });
}

export function loadCaseQcReports(activeJobIds: string[]): CaseQcReport[] {
  const jobIds = new Set(activeJobIds);
  const reports = readJson<CaseQcReport[]>(qcReportsKey, []);
  const normalizedReports = reports.filter((report) => jobIds.has(report.jobId)).map(normalizeQcReport);

  if (reports.length !== normalizedReports.length) {
    writeJson(qcReportsKey, normalizedReports);
  }

  return normalizedReports;
}

export function saveCaseQcReports(reports: CaseQcReport[]): void {
  writeJson(qcReportsKey, reports.map(normalizeQcReport));
}

export function createCaseQcReport(report: GenerateQcReportResponse): CaseQcReport {
  return normalizeQcReport({
    ...report,
    id: `${report.jobId}_qc_${Date.now()}`
  });
}

export function loadAiToolEndpoints(): AiToolEndpoint[] {
  return normalizeAiToolEndpoints(readJson(aiToolEndpointsKey, defaultAiToolEndpoints));
}

export function saveAiToolEndpoints(endpoints: AiToolEndpoint[]): void {
  writeJson(aiToolEndpointsKey, endpoints);
}

export function resetAiToolEndpoints(): AiToolEndpoint[] {
  writeJson(aiToolEndpointsKey, defaultAiToolEndpoints);
  return defaultAiToolEndpoints;
}

export function loadToolProviderSettings(): ToolProviderSettings[] {
  return normalizeToolProviderSettings(readJson<ToolProviderSettings[]>(toolProviderSettingsKey, defaultToolProviderSettings));
}

export function saveToolProviderSettings(settings: ToolProviderSettings[]): void {
  writeJson(toolProviderSettingsKey, normalizeToolProviderSettings(settings));
}

export function resetToolProviderSettings(): ToolProviderSettings[] {
  writeJson(toolProviderSettingsKey, defaultToolProviderSettings);
  return defaultToolProviderSettings;
}

export function getToolProviderPresets(toolType: ToolProviderType): ToolProviderPreset[] {
  return toolProviderPresets[toolType] ?? [];
}

export function getToolProviderPreset(toolType: ToolProviderType, providerOrPresetId: string): ToolProviderPreset | null {
  const normalizedValue = providerOrPresetId.trim().toLowerCase();

  return getToolProviderPresets(toolType).find((preset) => preset.id.toLowerCase() === normalizedValue || preset.provider.toLowerCase() === normalizedValue) ?? null;
}

export function getToolModelOptions(setting: Pick<ToolProviderSettings, "model" | "provider" | "toolType">, syncedModels: string[] = []): string[] {
  const preset = getToolProviderPreset(setting.toolType, setting.provider);
  const models = [...(preset?.models ?? []), ...syncedModels];
  const currentModel = setting.model.trim();

  return Array.from(new Set([...models, ...(currentModel && !models.includes(currentModel) ? [currentModel] : [])]));
}

export function usesCustomToolModel(setting: Pick<ToolProviderSettings, "model" | "provider" | "toolType">, syncedModels: string[] = []): boolean {
  const preset = getToolProviderPreset(setting.toolType, setting.provider);

  if (!preset) {
    return true;
  }

  return !preset.models.includes(setting.model) && !syncedModels.includes(setting.model);
}

export function applyToolProviderPreset(setting: ToolProviderSettings, presetId: string): ToolProviderSettings {
  const preset = getToolProviderPreset(setting.toolType, presetId);

  if (!preset) {
    return {
      ...setting,
      apiStyle: "custom",
      baseUrl: "",
      costMode: "custom",
      model: "",
      params: {},
      provider: "",
      updatedAt: new Date().toISOString()
    };
  }

  return {
    ...setting,
    apiStyle: preset.apiStyle,
    baseUrl: preset.baseUrl,
    costMode: preset.costMode,
    model: preset.defaultModel,
    params: { ...preset.params },
    provider: preset.provider,
    retryLimit: preset.retryLimit,
    updatedAt: new Date().toISOString()
  };
}

export function findToolProviderSettings(settings: ToolProviderSettings[], toolType: ToolProviderType): ToolProviderSettings | null {
  return settings.find((setting) => setting.toolType === toolType && setting.enabled) ?? settings.find((setting) => setting.toolType === toolType) ?? null;
}

export function buildToolProviderOverride(setting: ToolProviderSettings | null): ToolProviderOverride | undefined {
  if (!setting || !setting.enabled) {
    return undefined;
  }

  return {
    apiStyle: setting.apiStyle,
    baseUrl: setting.baseUrl,
    cost: {
      costMode: setting.costMode,
      fallbackCostRM: setting.fallbackCostRM,
      inputUnitPriceRM: setting.inputUnitPriceRM,
      outputUnitPriceRM: setting.outputUnitPriceRM
    },
    model: setting.model,
    params: setting.params,
    provider: setting.provider
  };
}

function normalizeToolProviderSettings(settings: ToolProviderSettings[]): ToolProviderSettings[] {
  const existingIds = new Set(settings.map((setting) => setting.id));
  const mergedSettings = [
    ...settings,
    ...defaultToolProviderSettings.filter((setting) => !existingIds.has(setting.id))
  ];

  return mergedSettings.map((setting) => ({
    allowAutopilot: setting.allowAutopilot ?? false,
    apiStyle: setting.apiStyle ?? "",
    baseUrl: setting.baseUrl ?? "",
    costMode: normalizeToolCostMode(setting.costMode),
    enabled: setting.enabled ?? true,
    fallbackCostRM: clampNumber(Number(setting.fallbackCostRM), 0, 1_000_000, 0),
    id: setting.id || createId("tool_setting"),
    inputUnitPriceRM: clampNumber(Number(setting.inputUnitPriceRM), 0, 1_000_000, 0),
    model: setting.model ?? "",
    outputUnitPriceRM: clampNumber(Number(setting.outputUnitPriceRM), 0, 1_000_000, 0),
    params: normalizeToolParams(setting.params),
    provider: setting.provider ?? "",
    retryLimit: clampNumber(Number(setting.retryLimit), 0, 10, 1),
    toolType: normalizeToolProviderType(setting.toolType),
    updatedAt: setting.updatedAt ?? new Date().toISOString()
  }));
}

function normalizeToolProviderType(value: unknown): ToolProviderType {
  const allowed: ToolProviderType[] = ["llm", "image", "design_image", "tts", "bgm", "video", "subtitle", "compose", "storage", "youtube"];
  return typeof value === "string" && allowed.includes(value as ToolProviderType) ? value as ToolProviderType : "llm";
}

function normalizeToolCostMode(value: unknown): ToolCostMode {
  const allowed: ToolCostMode[] = ["tokens", "image", "second", "character", "credit", "free", "custom"];
  return typeof value === "string" && allowed.includes(value as ToolCostMode) ? value as ToolCostMode : "custom";
}

function normalizeToolParams(value: unknown): Record<string, boolean | number | string> {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return {};
  }

  return Object.fromEntries(
    Object.entries(value as Record<string, unknown>).filter((entry): entry is [string, boolean | number | string] => {
      const [, entryValue] = entry;
      return typeof entryValue === "boolean" || typeof entryValue === "number" || typeof entryValue === "string";
    })
  );
}

function normalizeAiToolEndpoints(endpoints: AiToolEndpoint[]): AiToolEndpoint[] {
  const existingIds = new Set(endpoints.map((endpoint) => endpoint.id));
  const mergedEndpoints = [
    ...endpoints,
    ...defaultAiToolEndpoints.filter((endpoint) => !existingIds.has(endpoint.id))
  ];

  return mergedEndpoints.map((endpoint) => ({
    ...normalizeEndpointDefaults(endpoint),
    stageIds: endpoint.stageIds?.length ? endpoint.stageIds : getDefaultStageIdsForEndpoint(endpoint.id),
    status: normalizeEndpointStatus(endpoint.status),
    enabled: endpoint.status === "disabled" ? false : endpoint.enabled
  }));
}

function normalizeEndpointStatus(status: AiToolEndpoint["status"] | "mocked" | undefined): AiToolEndpoint["status"] {
  if (status === "ready" || status === "disabled" || status === "needs_setup") {
    return status;
  }

  return "needs_setup";
}

function getDefaultStageIdsForEndpoint(endpointId: string): ProductionStageId[] {
  return defaultAiToolEndpoints.find((endpoint) => endpoint.id === endpointId)?.stageIds ?? [];
}

function normalizeEndpointDefaults(endpoint: AiToolEndpoint): AiToolEndpoint {
  if (endpoint.id === "tool_video") {
    const defaultVideoEndpoint = defaultAiToolEndpoints.find((candidate) => candidate.id === "tool_video");

    if (!defaultVideoEndpoint) {
      return endpoint;
    }

    const isLegacyDefault =
      endpoint.provider === "Runway / MiniMax / fal video" ||
      endpoint.endpoint === "https://api.dev.runwayml.com/v1" ||
      endpoint.envKeys === "RUNWAY_API_KEY, MINIMAX_API_KEY, FAL_API_KEY";

    return isLegacyDefault
      ? {
          ...endpoint,
          provider: defaultVideoEndpoint.provider,
          endpoint: defaultVideoEndpoint.endpoint,
          envKeys: defaultVideoEndpoint.envKeys,
          costMode: defaultVideoEndpoint.costMode,
          status: endpoint.status === "disabled" ? "needs_setup" : endpoint.status,
          enabled: endpoint.status === "disabled" ? true : endpoint.enabled
        }
      : endpoint;
  }

  if (endpoint.id !== "tool_tts") {
    return endpoint;
  }

  const defaultTtsEndpoint = defaultAiToolEndpoints.find((candidate) => candidate.id === "tool_tts");

  if (!defaultTtsEndpoint) {
    return endpoint;
  }

  const isLegacyDefault =
    endpoint.provider === "ElevenLabs / OpenAI TTS" ||
    endpoint.endpoint === "https://api.elevenlabs.io/v1" ||
    endpoint.envKeys === "ELEVENLABS_API_KEY, OPENAI_API_KEY";

  return isLegacyDefault
    ? {
        ...endpoint,
        provider: defaultTtsEndpoint.provider,
        endpoint: defaultTtsEndpoint.endpoint,
        envKeys: defaultTtsEndpoint.envKeys,
        costMode: defaultTtsEndpoint.costMode
      }
    : endpoint;
}

export function loadProviderKeys(): ProviderKeyRecord[] {
  const keys = readJson<ProviderKeyRecord[]>(providerKeysKey, defaultProviderKeys).map((key) =>
    key.id === "key_seedance" && key.keyName === "SEEDANCE_API_KEY"
      ? {
          ...key,
          keyName: "BYTEPLUS_ARK_API_KEY",
          provider: "BytePlus ModelArk / Seedance 2.0",
          service: "Official video clips / image-to-video"
        }
      : key
  );
  const existingIds = new Set(keys.map((key) => key.id));
  const mergedKeys = [
    ...keys,
    ...defaultProviderKeys.filter((key) => !existingIds.has(key.id))
  ];

  if (mergedKeys.length !== keys.length) {
    writeJson(providerKeysKey, mergedKeys);
  }

  return mergedKeys;
}

export function saveProviderKeys(keys: ProviderKeyRecord[]): void {
  writeJson(providerKeysKey, keys);
}

export function resetProviderKeys(): ProviderKeyRecord[] {
  writeJson(providerKeysKey, defaultProviderKeys);
  return defaultProviderKeys;
}

export function applyProviderSecret(keys: ProviderKeyRecord[], id: string, secret: string): ProviderKeyRecord[] {
  const trimmedSecret = secret.trim();

  if (!trimmedSecret) {
    return keys;
  }

  const lastFour = trimmedSecret.slice(-4);

  return keys.map((key) =>
    key.id === id
      ? {
          ...key,
          status: "configured",
          lastFour,
          updatedAt: new Date().toISOString()
        }
      : key
  );
}

export function calculateNextRunAt(input: Pick<ProductionSchedule, "daysOfWeek" | "startTime">, now = new Date()): string {
  const [rawHour, rawMinute] = input.startTime.split(":");
  const hour = clampNumber(Number(rawHour), 0, 23, 9);
  const minute = clampNumber(Number(rawMinute), 0, 59, 0);
  const days = input.daysOfWeek.length > 0 ? input.daysOfWeek : [1, 2, 3, 4, 5, 6, 7];

  for (let offset = 0; offset <= 7; offset += 1) {
    const candidate = new Date(now);
    candidate.setDate(now.getDate() + offset);
    candidate.setHours(hour, minute, 0, 0);

    const candidateDay = candidate.getDay() === 0 ? 7 : candidate.getDay();

    if (days.includes(candidateDay) && candidate > now) {
      return candidate.toISOString();
    }
  }

  const fallback = new Date(now);
  fallback.setDate(now.getDate() + 1);
  fallback.setHours(hour, minute, 0, 0);
  return fallback.toISOString();
}

export function isSameLocalDay(leftIso: string, right = new Date()): boolean {
  const left = new Date(leftIso);
  return left.getFullYear() === right.getFullYear() && left.getMonth() === right.getMonth() && left.getDate() === right.getDate();
}

function normalizePublishingTargets(targets: PublishingTarget[]): PublishingTarget[] {
  return targets.map((target) => ({
    accountId: target.accountId,
    channelName: target.channelName || "Untitled channel",
    dailyQuota: clampNumber(Number(target.dailyQuota), 1, 50, 5),
    defaultPrivacy: "private",
    enabled: target.enabled ?? true,
    id: target.id || createId("target"),
    language: target.language === "en-US" ? "en-US" : "zh-CN",
    niche: target.niche || target.templateType || "rules_horror",
    templateType: normalizeTemplateType(target.templateType),
    updatedAt: target.updatedAt ?? new Date().toISOString(),
    uploadWindow: target.uploadWindow || "18:00-23:00",
    youtubeChannelId: target.youtubeChannelId || ""
  }));
}

function normalizeTemplateType(value: unknown): TemplateType {
  return typeof value === "string" && (contentTemplateTypes as readonly string[]).includes(value) ? (value as TemplateType) : "rules_horror";
}

function normalizeCharacterProfile(character: CharacterProfile): CharacterProfile {
  const now = new Date().toISOString();

  return {
    createdAt: character.createdAt ?? now,
    genre: character.genre === "multi_genre" || (contentTemplateTypes as readonly string[]).includes(character.genre) ? character.genre : "multi_genre",
    id: character.id || createId("character"),
    name: character.name || "Untitled Character",
    notes: character.notes ?? "",
    outfitLock: character.outfitLock ?? "",
    referenceImageUrl: character.referenceImageUrl ?? "",
    status: character.status === "approved" || character.status === "retired" ? character.status : "draft",
    styleLock: character.styleLock ?? "",
    updatedAt: character.updatedAt ?? now,
    visualIdentity: character.visualIdentity ?? "",
    voiceProfile: character.voiceProfile ?? ""
  };
}

function isLegacyGenreCharacter(character: CharacterProfile): boolean {
  return legacyGenreCharacterNames.has(character.name.trim()) &&
    !character.visualIdentity.trim() &&
    !character.referenceImageUrl.trim() &&
    !character.voiceProfile.trim();
}

function normalizeTrendReport(report: TrendReport): TrendReport {
  const now = new Date().toISOString();

  return {
    blocker: report.blocker,
    filteredOut: report.filteredOut ?? [],
    filterSummary: report.filterSummary ?? [],
    filters: {
      excludeKeywords: report.filters?.excludeKeywords ?? [],
      includeKeywords: report.filters?.includeKeywords ?? [],
      languageMode: report.filters?.languageMode === "strict" ? "strict" : "loose",
      minVelocityScore: report.filters?.minVelocityScore ?? 0,
      minViews: report.filters?.minViews ?? 0,
      safeMode: report.filters?.safeMode === "standard" ? "standard" : "strict",
      ...(report.filters?.categoryId ? { categoryId: report.filters.categoryId } : {})
    },
    id: report.id || createId("trend"),
    ideaSeeds: report.ideaSeeds ?? [],
    maxShortSeconds: report.maxShortSeconds ?? 180,
    patterns: report.patterns ?? [],
    provider: "youtube",
    publishedAfter: report.publishedAfter ?? now,
    query: report.query || "shorts",
    quotaUnits: report.quotaUnits ?? 0,
    regionCode: report.regionCode || "MY",
    savedAt: report.savedAt ?? now,
    scannedAt: report.scannedAt ?? now,
    status: report.status === "ready" ? "ready" : "blocked",
    videos: report.videos ?? []
  };
}

function normalizeQcReport(report: CaseQcReport): CaseQcReport {
  return {
    checks: report.checks ?? [],
    durationSeconds: report.durationSeconds,
    id: report.id || `${report.jobId}_qc_${Date.now()}`,
    jobId: report.jobId,
    passed: Boolean(report.passed),
    resolution: report.resolution,
    status: report.status === "QC_PASSED" ? "QC_PASSED" : "FAILED",
    summary: report.summary || "QC report",
    timestamp: report.timestamp ?? new Date().toISOString()
  };
}

function normalizeCasePublishTarget(target: CasePublishTarget): CasePublishTarget {
  return {
    approvedAt: target.approvedAt ?? null,
    error: target.error ?? null,
    id: target.id || `${target.jobId}_${target.targetId}`,
    jobId: target.jobId,
    privacyStatus: "private",
    retryCount: target.retryCount ?? 0,
    status: target.status ?? "pending_review",
    targetId: target.targetId,
    updatedAt: target.updatedAt ?? new Date().toISOString(),
    uploadedAt: target.uploadedAt ?? null,
    youtubeVideoId: target.youtubeVideoId ?? null
  };
}

function normalizeProductionSchedule(schedule: ProductionSchedule, allowedTargetIds?: Set<string>): ProductionSchedule {
  const targetIds = allowedTargetIds ? schedule.targetIds.filter((targetId) => allowedTargetIds.has(targetId)) : schedule.targetIds;
  const normalized = {
    approvalGate: "mp4_review" as const,
    budgetLimitRM: clampNumber(Number(schedule.budgetLimitRM), 1, 100000, 80),
    daysOfWeek: normalizeDaysOfWeek(schedule.daysOfWeek),
    enabled: schedule.enabled ?? true,
    id: schedule.id || createId("schedule"),
    lastRunAt: schedule.lastRunAt ?? null,
    maxCasesPerRun: clampNumber(Number(schedule.maxCasesPerRun), 1, 50, 5),
    maxVideosPerDay: clampNumber(Number(schedule.maxVideosPerDay), 1, 100, 10),
    name: schedule.name || "Daily Production Batch",
    nextRunAt: schedule.nextRunAt,
    startTime: normalizeStartTime(schedule.startTime),
    targetIds,
    timezone: schedule.timezone || "Asia/Kuala_Lumpur"
  };

  return {
    ...normalized,
    nextRunAt: normalized.nextRunAt && new Date(normalized.nextRunAt).toString() !== "Invalid Date" ? normalized.nextRunAt : calculateNextRunAt(normalized)
  };
}

function normalizeScheduleRun(run: ScheduleRun): ScheduleRun {
  const now = new Date().toISOString();

  return {
    createdCaseIds: run.createdCaseIds ?? [],
    error: run.error ?? null,
    finishedAt: run.finishedAt ?? now,
    id: run.id || createId("run"),
    plannedCaseCount: run.plannedCaseCount ?? 0,
    scheduleId: run.scheduleId,
    startedAt: run.startedAt ?? now,
    status: run.status ?? "completed"
  };
}

function normalizeDaysOfWeek(days: number[]): number[] {
  const normalized = Array.from(new Set(days.map(Number).filter((day) => day >= 1 && day <= 7))).sort((a, b) => a - b);
  return normalized.length > 0 ? normalized : [1, 2, 3, 4, 5, 6, 7];
}

function normalizeStartTime(value: string): string {
  const [rawHour, rawMinute] = value.split(":");
  const hour = String(clampNumber(Number(rawHour), 0, 23, 9)).padStart(2, "0");
  const minute = String(clampNumber(Number(rawMinute), 0, 59, 0)).padStart(2, "0");
  return `${hour}:${minute}`;
}

function clampNumber(value: number, min: number, max: number, fallback: number): number {
  if (!Number.isFinite(value)) {
    return fallback;
  }

  return Math.min(max, Math.max(min, value));
}
