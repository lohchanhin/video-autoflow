import { afterEach, describe, expect, it, vi } from "vitest";
import type { ContentSeries, StoryWorld } from "@ai-content-factory/shared-types";
import { buildEpisodeIdeaPrompt, createSeriesEpisodeIdeaService } from "../src/modules/series/episode-idea-service.js";

describe("series episode idea service", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("locks generated episode ideas to the bound story world", () => {
    const prompt = buildEpisodeIdeaPrompt(createSeries(), 10, createStoryWorld());

    expect(prompt).toContain("香蕉总裁");
    expect(prompt).toContain("水果公司");
    expect(prompt).toContain("不可替换的系列上下文");
    expect(prompt).toContain("输出不得改成「橘子总裁」");
    expect(prompt).toContain("每条选题必须保留上述世界观的主角");
  });

  it("sends the story world context to OpenAI instead of only the storyWorldId", async () => {
    let requestBody: { input?: string } = {};

    vi.stubGlobal("fetch", vi.fn(async (_url: string, init: RequestInit) => {
      requestBody = JSON.parse(String(init.body)) as { input?: string };

      return new Response(JSON.stringify({
        output_text: JSON.stringify({
          ideas: [
            {
              ageRange: "18-35",
              episodeNo: 1,
              interactiveEnding: "你会怎样帮香蕉总裁化解误会？",
              lessonOrTheme: "沟通确认",
              moralLesson: "开会后要复述确认。",
              promptSeed: "香蕉总裁误会会议纪要，团队用复述确认解决冲突。",
              riskNotes: "低风险",
              selectedCharacterAssetIds: [],
              selectedSceneAssetIds: [],
              sourceStory: "原创水果职场",
              synopsis: "香蕉总裁听错员工汇报，差点取消新品发布，最后建立复述确认规则。",
              title: "香蕉总裁的会议误会"
            }
          ]
        }),
        usage: {
          input_tokens: 100,
          output_tokens: 100
        }
      }), { status: 200 });
    }));

    const service = createSeriesEpisodeIdeaService({
      openai: {
        apiKey: "test-key",
        baseUrl: "https://api.openai.test/v1",
        model: "gpt-4.1-mini",
        usdToMyrRate: 4
      }
    });

    await service.generateEpisodeIdeas({
      count: 1,
      series: createSeries(),
      storyWorld: createStoryWorld()
    });

    expect(requestBody.input).toContain("香蕉总裁");
    expect(requestBody.input).toContain("世界设定：水果公司里，香蕉总裁每天处理员工误会和办公室冲突。");
    expect(requestBody.input).toContain("不得替换为相近概念");
  });
});

function createSeries(overrides: Partial<ContentSeries> = {}): ContentSeries {
  const now = "2026-06-14T00:00:00.000Z";

  return {
    _id: overrides._id ?? "series_fruit",
    audience: overrides.audience ?? "喜欢办公室短剧的观众",
    contentType: overrides.contentType ?? "水果职场短剧",
    createdAt: overrides.createdAt ?? now,
    description: overrides.description ?? "围绕香蕉总裁和水果公司员工的办公室八点档。",
    durationSeconds: overrides.durationSeconds ?? 45,
    language: overrides.language ?? "zh-CN",
    musicStyle: overrides.musicStyle ?? "轻快、戏剧化",
    name: overrides.name ?? "水果八点档",
    referenceAssetIds: overrides.referenceAssetIds ?? [],
    safetyRules: overrides.safetyRules ?? "不暴力、不血腥、不成人内容。",
    sceneCount: overrides.sceneCount ?? 5,
    status: overrides.status ?? "active",
    storyWorldId: overrides.storyWorldId ?? "world_banana_ceo",
    tone: overrides.tone ?? "夸张、轻喜剧、办公室抓马",
    updatedAt: overrides.updatedAt ?? now,
    values: overrides.values ?? "沟通、责任、团队协作",
    visualStyle: overrides.visualStyle ?? "拟人水果角色，现代办公室"
  };
}

function createStoryWorld(overrides: Partial<StoryWorld> = {}): StoryWorld {
  const now = "2026-06-14T00:00:00.000Z";

  return {
    _id: overrides._id ?? "world_banana_ceo",
    createdAt: overrides.createdAt ?? now,
    defaultSceneAssetIds: overrides.defaultSceneAssetIds ?? [],
    description: overrides.description ?? "水果公司里，香蕉总裁每天处理员工误会和办公室冲突。",
    name: overrides.name ?? "香蕉总裁办公室",
    recurringCharacterAssetIds: overrides.recurringCharacterAssetIds ?? [],
    relationshipMap: overrides.relationshipMap ?? "香蕉总裁是公司老板，员工可以变化，但总裁身份不能改成橘子、苹果或其他水果。",
    safetyRules: overrides.safetyRules ?? "保持轻喜剧，不出现恶意羞辱。",
    seriesIds: overrides.seriesIds ?? ["series_fruit"],
    status: overrides.status ?? "active",
    updatedAt: overrides.updatedAt ?? now,
    visualStyle: overrides.visualStyle ?? "拟人香蕉总裁，西装，办公室，短剧镜头"
  };
}
