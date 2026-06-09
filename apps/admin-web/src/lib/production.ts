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
    label: "需求 / Prompt",
    category: "planning",
    queueName: "jobs.create",
    provider: "apps/api-server",
    defaultInput: "收集主题、内容限制、预算、频道和私密上传要求。",
    defaultOutput: "已建立包含生产 brief 的 Case。"
  },
  {
    id: "script",
    order: 2,
    label: "文案 / 脚本",
    category: "generation",
    queueName: "script.queue",
    provider: "LLMProvider",
    defaultInput: "撰写开场钩子、标题、旁白、描述和合规安全的故事文案。",
    defaultOutput: "脚本文档。"
  },
  {
    id: "storyboard",
    order: 3,
    label: "分镜",
    category: "generation",
    queueName: "storyboard.queue",
    provider: "LLMProvider",
    defaultInput: "把脚本拆成带时长、镜头运动、音效和旁白文本的场景。",
    defaultOutput: "分镜场景列表。"
  },
  {
    id: "prompt",
    order: 4,
    label: "图片提示词",
    category: "generation",
    queueName: "prompt.queue",
    provider: "LLMProvider",
    defaultInput: "把场景转换成适合供应商调用的图片提示词和负面提示词。",
    defaultOutput: "图片 prompt 包。"
  },
  {
    id: "image",
    order: 5,
    label: "图片",
    category: "generation",
    queueName: "image.queue",
    provider: "ImageProvider",
    defaultInput: "生成适合竖屏视频的场景静帧。",
    defaultOutput: "图片资产路径。"
  },
  {
    id: "video",
    order: 6,
    label: "视频片段（可选）",
    category: "generation",
    queueName: "video.queue",
    provider: "VideoProvider",
    defaultInput: "可选的图生视频动态化步骤。MVP 默认按成本控制关闭。",
    defaultOutput: "启用后产出动态视频片段。"
  },
  {
    id: "tts",
    order: 7,
    label: "配音",
    category: "generation",
    queueName: "tts.queue",
    provider: "TTSProvider",
    defaultInput: "根据已批准旁白文本生成配音音频。",
    defaultOutput: "音频资产路径。"
  },
  {
    id: "bgm",
    order: 8,
    label: "背景音乐",
    category: "generation",
    queueName: "bgm.queue",
    provider: "MusicProvider",
    defaultInput: "根据内容模板和时长生成匹配的纯音乐背景音。",
    defaultOutput: "BGM 音频路径。"
  },
  {
    id: "subtitle",
    order: 9,
    label: "字幕",
    category: "assembly",
    queueName: "subtitle.queue",
    provider: "Local subtitle generator",
    defaultInput: "根据旁白文本生成分段 SRT / ASS 字幕。",
    defaultOutput: "字幕文件路径。"
  },
  {
    id: "compose",
    order: 10,
    label: "FFmpeg 合成",
    category: "assembly",
    queueName: "compose.queue",
    provider: "Local FFmpeg",
    defaultInput: "把画面、配音、字幕、BGM 和音效合成为 1080x1920 MP4。",
    defaultOutput: "最终 MP4 路径。"
  },
  {
    id: "qc",
    order: 11,
    label: "QC 审核",
    category: "assembly",
    queueName: "qc.queue",
    provider: "compliance-rules",
    defaultInput: "检查时长、资产、预算、禁用关键词和私密上传安全。",
    defaultOutput: "QC 结果和备注。"
  },
  {
    id: "publish",
    order: 12,
    label: "YouTube 私密上传",
    category: "publishing",
    queueName: "publish.queue",
    provider: "YouTubeProvider",
    defaultInput: "除非明确启用自动公开，否则只允许 private 上传。",
    defaultOutput: "YouTube video ID 和发布记录。"
  },
  {
    id: "archive",
    order: 13,
    label: "GCS 归档",
    category: "storage",
    queueName: "storage.write",
    provider: "Google Cloud Storage",
    defaultInput: "保存最终 MP4、缩略图、音频、字幕和 metadata。",
    defaultOutput: "GCS object 路径。"
  }
];

export function getProductionStage(id: ProductionStageId): ProductionStageDefinition {
  const stage = productionStages.find((candidate) => candidate.id === id);

  if (!stage) {
    throw new Error(`Unknown production stage: ${id}`);
  }

  return stage;
}
