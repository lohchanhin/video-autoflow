import type { ContentSeries, StoryWorld } from "@ai-content-factory/shared-types";
import type { SeriesEpisodeIdeaCreateInput } from "@ai-content-factory/database";
import { MissingGenerationDependencyError } from "../../errors.js";

export interface OpenAISeriesIdeaOptions {
  apiKey?: string | undefined;
  baseUrl: string;
  model: string;
  usdToMyrRate: number;
}

export interface SeriesEpisodeIdeaServiceOptions {
  openai: OpenAISeriesIdeaOptions;
}

export interface GenerateSeriesEpisodeIdeasInput {
  count: number;
  series: ContentSeries;
  storyWorld?: StoryWorld | null | undefined;
}

export interface GeneratedSeriesEpisodeIdeas {
  costRM: number;
  ideas: SeriesEpisodeIdeaCreateInput[];
  model: string;
  provider: "openai";
  usage: {
    inputTokens: number;
    outputTokens: number;
    pricingMode?: "configured_rate" | "pricing_missing" | "token_usage" | undefined;
  };
}

export interface SeriesEpisodeIdeaService {
  generateEpisodeIdeas(input: GenerateSeriesEpisodeIdeasInput): Promise<GeneratedSeriesEpisodeIdeas>;
}

interface OpenAIResponseBody {
  output?: Array<{
    content?: Array<{
      text?: string;
      type?: string;
    }>;
    type?: string;
  }>;
  output_text?: string;
  usage?: {
    input_tokens?: number;
    output_tokens?: number;
  };
}

interface ParsedIdeas {
  ideas: Array<{
    ageRange?: string;
    continuityNote?: string;
    episodeNo?: number;
    interactiveEnding?: string;
    lessonOrTheme?: string;
    moralLesson?: string;
    promptSeed?: string;
    riskNotes?: string;
    serialHook?: string;
    selectedCharacterAssetIds?: string[];
    selectedSceneAssetIds?: string[];
    sourceStory?: string;
    synopsis?: string;
    title?: string;
  }>;
}

export function createSeriesEpisodeIdeaService(options: SeriesEpisodeIdeaServiceOptions): SeriesEpisodeIdeaService {
  return {
    async generateEpisodeIdeas(input: GenerateSeriesEpisodeIdeasInput): Promise<GeneratedSeriesEpisodeIdeas> {
      if (!options.openai.apiKey) {
        throw new MissingGenerationDependencyError("Missing OPENAI_API_KEY. Configure the OpenAI key before generating series episode ideas.");
      }

      const prompt = buildEpisodeIdeaPrompt(input.series, input.count, input.storyWorld ?? null);
      const response = await fetch(`${options.openai.baseUrl.replace(/\/$/u, "")}/responses`, {
        body: JSON.stringify({
          input: prompt,
          max_output_tokens: Math.min(4200, 800 + input.count * 180),
          model: options.openai.model,
          text: {
            format: {
              name: "series_episode_ideas",
              schema: episodeIdeasJsonSchema,
              strict: true,
              type: "json_schema"
            }
          }
        }),
        headers: {
          Authorization: `Bearer ${options.openai.apiKey}`,
          "Content-Type": "application/json"
        },
        method: "POST"
      });
      const body = (await response.json().catch(() => ({}))) as OpenAIResponseBody & { error?: { message?: string } };

      if (!response.ok) {
        throw new Error(`OpenAI series idea generation failed: ${body.error?.message ?? response.statusText}`);
      }

      const parsed = parseEpisodeIdeasJson(extractResponseText(body));
      const ideas = normalizeIdeas(parsed, input.count);
      const estimatedCostRM = estimateOpenAICostRM(options.openai.model, body.usage?.input_tokens ?? 0, body.usage?.output_tokens ?? 0, options.openai.usdToMyrRate);
      const usage = {
        inputTokens: body.usage?.input_tokens ?? 0,
        outputTokens: body.usage?.output_tokens ?? 0,
        pricingMode: estimatedCostRM > 0 ? "token_usage" as const : "pricing_missing" as const
      };

      return {
        costRM: estimatedCostRM,
        ideas,
        model: options.openai.model,
        provider: "openai",
        usage
      };
    }
  };
}

export function buildEpisodeIdeaPrompt(series: ContentSeries, count: number, storyWorld: StoryWorld | null = null): string {
  const lockedContext = buildLockedSeriesContext(series, storyWorld);

  return [
    "你是 AI Content Factory 的系列题库策划。请为一个短视频系列生成可审核、可转成生产 Case 的单集题库。",
    "",
    "必须严格遵守：",
    "- 只输出 JSON，不要 markdown。",
    "- 每条题目都要能直接转成短视频 Case，并适配该系列设定的时长、场景数、受众和风格。",
    "- 不要把某个固定题材强加到系列里；必须以系列设定为最高优先级。",
    "- 如果系列没有明确指定某个内容方向，不要自动套任何固定模板。",
    "- 安全与禁忌只按「系列安全规则」执行，另外遵守项目底线：原创、不侵权、不使用真实人物肖像、不写露骨性内容或血腥 gore。",
    "- 可以参考公共文化、行业知识、生活场景或原创设定，但必须写成可拍、原创、可审核的版本，不要逐字复刻现有内容。",
    "- 如果系列或背景故事指定了主角、物种、身份、公司、地点或核心设定，必须逐字沿用，不得替换为相近概念。",
    "- 例如背景故事写的是「香蕉总裁」，输出不得改成「橘子总裁」「苹果老板」或其他水果/身份。",
    "",
    `系列名称：${series.name}`,
    `语言：${series.language}`,
    `目标观众：${series.audience}`,
    `内容类型：${series.contentType}`,
    `系列定位：${series.description}`,
    `核心价值观：${series.values}`,
    `叙事语气：${series.tone}`,
    `视觉风格：${series.visualStyle}`,
    `BGM 风格：${series.musicStyle}`,
    `每集时长：${series.durationSeconds} 秒`,
    `场景数：${series.sceneCount}`,
    `安全规则：${series.safetyRules}`,
    "",
    storyWorld ? "背景故事 / Story World（硬约束，必须使用）：" : "背景故事 / Story World：未绑定；只能按系列设定原创，不要虚构固定世界观。",
    storyWorld ? `世界观名称：${storyWorld.name}` : "",
    storyWorld ? `世界设定：${storyWorld.description}` : "",
    storyWorld ? `角色关系 / 常驻结构：${storyWorld.relationshipMap}` : "",
    storyWorld ? `世界视觉风格：${storyWorld.visualStyle}` : "",
    storyWorld ? `世界安全规则：${storyWorld.safetyRules}` : "",
    storyWorld ? `不可替换的系列上下文：${lockedContext}` : "",
    storyWorld ? "一致性要求：每条选题必须保留上述世界观的主角、身份、地点、组织和核心关系；只能在这个世界内扩展新冲突和新剧情。" : "",
    "",
    `请生成 ${count} 条单集选题。每条必须包含：集数、标题、核心看点/价值、来源/灵感、剧情梗概、promptSeed、目标受众/年龄层、风险提示、互动结尾。`,
    "字段语义说明：lessonOrTheme / moralLesson 表示该集的核心看点、观点、价值或知识点，不一定是道德说教；sourceStory 表示来源/灵感；ageRange 表示目标受众或年龄层；selectedCharacterAssetIds 和 selectedSceneAssetIds 只有在你明确知道系列绑定资产 ID 时才填写，否则返回空数组。",
    `Narrative mode: ${series.narrativeMode}`,
    `Drama intensity: ${series.dramaIntensity}`,
    series.continuityRules ? `Continuity rules: ${series.continuityRules}` : "",
    series.narrativeMode === "serialized"
      ? "Serialized series requirement: generate episodes as a continuing drama with shared continuity, escalating unresolved tension, previous/next episode hooks, and a cliffhanger or open question in serialHook. Do not reset the premise each episode."
      : "Standalone requirement: each idea must resolve its core episode conflict in one short, while still fitting the reusable series world.",
    series.dramaIntensity === "melodrama" || series.dramaIntensity === "high"
      ? "High melodrama requirement: use safe but intense drama such as misunderstanding, betrayal, secret reveal, public confrontation, reversal, emotional choice, and cliffhanger. Keep it fictional, non-explicit, non-gory, and non-humiliating."
      : "Drama requirement: keep conflict clear and watchable without overloading the episode."
  ].filter((line) => line !== "").join("\n");
}

function buildLockedSeriesContext(series: ContentSeries, storyWorld: StoryWorld | null): string {
  return [
    series.name,
    series.description,
    series.values,
    series.tone,
    series.narrativeMode,
    series.dramaIntensity,
    series.continuityRules,
    series.visualStyle,
    storyWorld?.name,
    storyWorld?.description,
    storyWorld?.relationshipMap,
    storyWorld?.visualStyle,
    storyWorld?.safetyRules
  ].filter(Boolean).join(" / ");
}

function parseEpisodeIdeasJson(text: string): ParsedIdeas {
  try {
    const parsed = JSON.parse(text) as ParsedIdeas;

    if (!Array.isArray(parsed.ideas)) {
      throw new Error("ideas must be an array.");
    }

    return parsed;
  } catch (error) {
    throw new Error(`OpenAI series idea response was not valid JSON: ${error instanceof Error ? error.message : "unknown parse error"}`);
  }
}

function normalizeIdeas(parsed: ParsedIdeas, count: number): SeriesEpisodeIdeaCreateInput[] {
  return parsed.ideas
    .map((idea): SeriesEpisodeIdeaCreateInput => ({
      ageRange: normalizeText(idea.ageRange, ""),
      continuityNote: normalizeText(idea.continuityNote, ""),
      episodeNo: typeof idea.episodeNo === "number" ? idea.episodeNo : undefined,
      interactiveEnding: normalizeText(idea.interactiveEnding, ""),
      lessonOrTheme: normalizeText(idea.lessonOrTheme, idea.moralLesson ?? ""),
      moralLesson: normalizeText(idea.moralLesson, "核心看点待补充"),
      promptSeed: normalizeText(idea.promptSeed, idea.synopsis ?? idea.title ?? ""),
      serialHook: normalizeText(idea.serialHook, ""),
      riskNotes: normalizeText(idea.riskNotes, "按系列安全规则复核。"),
      selectedCharacterAssetIds: Array.isArray(idea.selectedCharacterAssetIds) ? idea.selectedCharacterAssetIds : [],
      selectedSceneAssetIds: Array.isArray(idea.selectedSceneAssetIds) ? idea.selectedSceneAssetIds : [],
      sourceStory: normalizeText(idea.sourceStory, "原创灵感"),
      status: "draft",
      synopsis: normalizeText(idea.synopsis, ""),
      title: normalizeText(idea.title, "未命名单集")
    }))
    .filter((idea) => idea.title && idea.synopsis && idea.promptSeed)
    .slice(0, count);
}

function extractResponseText(body: OpenAIResponseBody): string {
  if (typeof body.output_text === "string" && body.output_text.trim()) {
    return body.output_text;
  }

  const text = body.output
    ?.flatMap((item) => item.content ?? [])
    .map((content) => content.text ?? "")
    .join("")
    .trim();

  if (!text) {
    throw new Error("OpenAI series idea response did not include output text.");
  }

  return text;
}

function normalizeText(value: unknown, fallback: string): string {
  return typeof value === "string" && value.trim() ? value.trim() : fallback;
}

function estimateOpenAICostRM(model: string, inputTokens: number, outputTokens: number, usdToMyrRate: number): number {
  const pricing = getOpenAITextPricingUSD(model);
  const usd = (inputTokens / 1_000_000) * pricing.inputPerMillionUSD + (outputTokens / 1_000_000) * pricing.outputPerMillionUSD;
  return Number((usd * usdToMyrRate).toFixed(4));
}

function getOpenAITextPricingUSD(model: string): { inputPerMillionUSD: number; outputPerMillionUSD: number } {
  const table: Record<string, { inputPerMillionUSD: number; outputPerMillionUSD: number }> = {
    "gpt-4.1": { inputPerMillionUSD: 2, outputPerMillionUSD: 8 },
    "gpt-4.1-mini": { inputPerMillionUSD: 0.4, outputPerMillionUSD: 1.6 },
    "gpt-4o-mini": { inputPerMillionUSD: 0.15, outputPerMillionUSD: 0.6 },
    "gpt-5": { inputPerMillionUSD: 1.25, outputPerMillionUSD: 10 },
    "gpt-5-mini": { inputPerMillionUSD: 0.25, outputPerMillionUSD: 2 },
    "gpt-5-nano": { inputPerMillionUSD: 0.05, outputPerMillionUSD: 0.4 },
    "gpt-5.4": { inputPerMillionUSD: 2.5, outputPerMillionUSD: 15 },
    "gpt-5.4-mini": { inputPerMillionUSD: 0.75, outputPerMillionUSD: 4.5 },
    "gpt-5.4-nano": { inputPerMillionUSD: 0.2, outputPerMillionUSD: 1.25 },
    "gpt-5.4-pro": { inputPerMillionUSD: 30, outputPerMillionUSD: 180 },
    "gpt-5.5": { inputPerMillionUSD: 5, outputPerMillionUSD: 30 },
    "gpt-5.5-pro": { inputPerMillionUSD: 30, outputPerMillionUSD: 180 }
  };

  return table[model] ?? { inputPerMillionUSD: 0, outputPerMillionUSD: 0 };
}

const episodeIdeasJsonSchema = {
  additionalProperties: false,
  properties: {
    ideas: {
      items: {
        additionalProperties: false,
        properties: {
          ageRange: { type: "string" },
          continuityNote: { type: "string" },
          episodeNo: { type: "number" },
          interactiveEnding: { type: "string" },
          lessonOrTheme: { type: "string" },
          moralLesson: { type: "string" },
          promptSeed: { type: "string" },
          riskNotes: { type: "string" },
          serialHook: { type: "string" },
          selectedCharacterAssetIds: { items: { type: "string" }, type: "array" },
          selectedSceneAssetIds: { items: { type: "string" }, type: "array" },
          sourceStory: { type: "string" },
          synopsis: { type: "string" },
          title: { type: "string" }
        },
        required: ["episodeNo", "title", "lessonOrTheme", "moralLesson", "sourceStory", "synopsis", "promptSeed", "ageRange", "riskNotes", "interactiveEnding", "serialHook", "continuityNote", "selectedCharacterAssetIds", "selectedSceneAssetIds"],
        type: "object"
      },
      type: "array"
    }
  },
  required: ["ideas"],
  type: "object"
} as const;
