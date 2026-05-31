export const productionStageIds = [
  "brief",
  "script",
  "storyboard",
  "prompt",
  "image",
  "video",
  "tts",
  "bgm",
  "subtitle",
  "compose",
  "qc",
  "publish",
  "archive"
] as const;

export type ProductionStageId = (typeof productionStageIds)[number];

export interface ProductionStageDefinition {
  id: ProductionStageId;
  order: number;
  label: string;
  category: "planning" | "generation" | "assembly" | "publishing" | "storage";
  queueName: string;
  provider: string;
  defaultInput: string;
  defaultOutput: string;
}

export const productionStages: ProductionStageDefinition[] = [
  {
    id: "brief",
    order: 1,
    label: "Brief / Prompt",
    category: "planning",
    queueName: "jobs.create",
    provider: "apps/api-server",
    defaultInput: "Collect topic, content constraints, budget, channel, and private upload requirements.",
    defaultOutput: "Case created with production brief."
  },
  {
    id: "script",
    order: 2,
    label: "Copywriting / Script",
    category: "generation",
    queueName: "script.queue",
    provider: "LLMProvider",
    defaultInput: "Write hook, title, voiceover, description, and compliance-safe story copy.",
    defaultOutput: "Script document."
  },
  {
    id: "storyboard",
    order: 3,
    label: "Storyboard",
    category: "generation",
    queueName: "storyboard.queue",
    provider: "LLMProvider",
    defaultInput: "Split script into timed scenes with camera motion, SFX, and voice text.",
    defaultOutput: "Scene list."
  },
  {
    id: "prompt",
    order: 4,
    label: "Image Prompts",
    category: "generation",
    queueName: "prompt.queue",
    provider: "LLMProvider",
    defaultInput: "Convert scenes into provider-safe image prompts and negative prompts.",
    defaultOutput: "Prompt pack."
  },
  {
    id: "image",
    order: 5,
    label: "Images",
    category: "generation",
    queueName: "image.queue",
    provider: "ImageProvider",
    defaultInput: "Generate vertical-safe scene stills.",
    defaultOutput: "Image asset paths."
  },
  {
    id: "video",
    order: 6,
    label: "Video Clips Optional",
    category: "generation",
    queueName: "video.queue",
    provider: "VideoProvider",
    defaultInput: "Optional image-to-video motion pass. Disabled by default for MVP cost control.",
    defaultOutput: "Motion clips when enabled."
  },
  {
    id: "tts",
    order: 7,
    label: "Voiceover",
    category: "generation",
    queueName: "tts.queue",
    provider: "TTSProvider",
    defaultInput: "Generate narration audio from approved voiceover text.",
    defaultOutput: "Audio asset path."
  },
  {
    id: "bgm",
    order: 8,
    label: "Background Music",
    category: "generation",
    queueName: "bgm.queue",
    provider: "MusicProvider",
    defaultInput: "Generate instrumental background music matched to the content template and duration.",
    defaultOutput: "BGM audio path."
  },
  {
    id: "subtitle",
    order: 9,
    label: "Subtitles",
    category: "assembly",
    queueName: "subtitle.queue",
    provider: "Local subtitle generator",
    defaultInput: "Create segmented SRT / ASS subtitles from narration text.",
    defaultOutput: "Subtitle file path."
  },
  {
    id: "compose",
    order: 10,
    label: "FFmpeg Compose",
    category: "assembly",
    queueName: "compose.queue",
    provider: "Local FFmpeg",
    defaultInput: "Compose media, voiceover, subtitles, BGM, and SFX into 1080x1920 MP4.",
    defaultOutput: "Final MP4 path."
  },
  {
    id: "qc",
    order: 11,
    label: "QC Review",
    category: "assembly",
    queueName: "qc.queue",
    provider: "compliance-rules",
    defaultInput: "Check duration, assets, budget, forbidden keywords, and private upload safety.",
    defaultOutput: "QC decision and notes."
  },
  {
    id: "publish",
    order: 12,
    label: "YouTube Private Upload",
    category: "publishing",
    queueName: "publish.queue",
    provider: "YouTubeProvider",
    defaultInput: "Upload only as private unless auto-public is explicitly enabled.",
    defaultOutput: "YouTube video ID and publishing log."
  },
  {
    id: "archive",
    order: 13,
    label: "GCS Archive",
    category: "storage",
    queueName: "storage.write",
    provider: "Google Cloud Storage",
    defaultInput: "Store final MP4, thumbnail, audio, subtitles, and metadata.",
    defaultOutput: "GCS object paths."
  }
];

export function getProductionStage(id: ProductionStageId): ProductionStageDefinition {
  const stage = productionStages.find((candidate) => candidate.id === id);

  if (!stage) {
    throw new Error(`Unknown production stage: ${id}`);
  }

  return stage;
}
