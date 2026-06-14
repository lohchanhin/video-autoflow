import request from "supertest";
import { describe, expect, it, vi } from "vitest";
import type { ContentSeries, SeriesEpisodeIdea, StoryWorld } from "@ai-content-factory/shared-types";
import type { ContentSeriesRepository, SeriesEpisodeIdeaCreateInput, StoryWorldsRepository } from "@ai-content-factory/database";
import type { SeriesEpisodeIdeaService } from "../src/modules/series/episode-idea-service.js";
import { createApp } from "../src/app.js";

describe("series API", () => {
  it("creates and updates a content series", async () => {
    const repository = createSeriesRepositoryMock();

    const createResponse = await request(createApp({ contentSeriesRepository: repository }))
      .post("/series")
      .send({
        audience: "创业者 / 内容运营",
        contentType: "AI 工具科普",
        name: "AI 工具实战系列"
      })
      .expect(201);

    const seriesId = createResponse.body.series._id;

    await request(createApp({ contentSeriesRepository: repository }))
      .patch(`/series/${seriesId}`)
      .send({ status: "active", values: "帮用户理解工具边界和落地场景" })
      .expect(200);

    expect(repository.createSeries).toHaveBeenCalledWith(expect.objectContaining({
      contentType: "AI 工具科普",
      name: "AI 工具实战系列"
    }));
    expect(repository.patchSeries).toHaveBeenCalledWith(seriesId, expect.objectContaining({
      status: "active",
      values: "帮用户理解工具边界和落地场景"
    }));
  });

  it("generates episode ideas and stores them in MongoDB repository", async () => {
    const series = createSeries();
    const repository = createSeriesRepositoryMock({
      findSeriesById: vi.fn().mockResolvedValue(series)
    });
    const episodeIdeaService = {
      generateEpisodeIdeas: vi.fn().mockResolvedValue({
        costRM: 0.0123,
        ideas: [
          {
            ageRange: "创业者",
            moralLesson: "理解 AI 自动化的真实边界",
            promptSeed: "用一个小团队误用自动化工具的案例解释什么该自动化、什么该人工审核。",
            riskNotes: "低风险",
            sourceStory: "原创商业场景",
            synopsis: "一个小团队把所有发布交给自动化，最后学会把关键审核留给人。",
            title: "自动化不是全自动"
          }
        ],
        model: "gpt-4.1-mini",
        provider: "openai",
        usage: {
          inputTokens: 100,
          outputTokens: 200
        }
      })
    } as unknown as SeriesEpisodeIdeaService;

    const response = await request(createApp({ contentSeriesRepository: repository, seriesEpisodeIdeaService: episodeIdeaService }))
      .post(`/series/${series._id}/episodes/generate`)
      .send({ count: 10 })
      .expect(201);

    expect(response.body).toMatchObject({
      costRM: 0.0123,
      status: "EPISODE_IDEAS_GENERATED"
    });
    expect(repository.createEpisodeIdeas).toHaveBeenCalledWith(series._id, expect.arrayContaining([
      expect.objectContaining({ title: "自动化不是全自动" })
    ]));
  });

  it("passes the bound story world content into AI episode idea generation", async () => {
    const series = createSeries({
      contentType: "水果职场短剧",
      description: "围绕香蕉总裁的办公室荒诞管理故事。",
      name: "水果八点档",
      storyWorldId: "world_banana_ceo"
    });
    const storyWorld = createStoryWorld({
      _id: "world_banana_ceo",
      description: "水果公司里，香蕉总裁每天处理员工误会和办公室冲突；主角必须是香蕉总裁。",
      name: "香蕉总裁办公室",
      relationshipMap: "香蕉总裁是公司老板，员工可以变化，但总裁身份不能改成其他水果。"
    });
    const repository = createSeriesRepositoryMock({
      findSeriesById: vi.fn().mockResolvedValue(series)
    });
    const storyWorldsRepository = createStoryWorldsRepositoryMock(storyWorld);
    const episodeIdeaService = {
      generateEpisodeIdeas: vi.fn().mockResolvedValue({
        costRM: 0.01,
        ideas: [
          {
            ageRange: "泛娱乐观众",
            moralLesson: "沟通要说清楚",
            promptSeed: "香蕉总裁误会会议纪要，最后学会复述确认。",
            riskNotes: "低风险",
            sourceStory: "原创水果职场",
            synopsis: "香蕉总裁因为一句话误会团队，最后建立会议复述规则。",
            title: "香蕉总裁的会议误会"
          }
        ],
        model: "gpt-4.1-mini",
        provider: "openai",
        usage: { inputTokens: 120, outputTokens: 220 }
      })
    } as unknown as SeriesEpisodeIdeaService;

    await request(createApp({
      contentSeriesRepository: repository,
      seriesEpisodeIdeaService: episodeIdeaService,
      storyWorldsRepository
    }))
      .post(`/series/${series._id}/episodes/generate`)
      .send({ count: 10 })
      .expect(201);

    expect(storyWorldsRepository.findById).toHaveBeenCalledWith("world_banana_ceo");
    expect(episodeIdeaService.generateEpisodeIdeas).toHaveBeenCalledWith(expect.objectContaining({
      count: 10,
      series,
      storyWorld: expect.objectContaining({
        description: expect.stringContaining("香蕉总裁"),
        name: "香蕉总裁办公室"
      })
    }));
  });

  it("blocks rejected episode ideas from converting to a case", async () => {
    const series = createSeries();
    const episode = createEpisode({ status: "rejected" });
    const repository = createSeriesRepositoryMock({
      findEpisodeIdea: vi.fn().mockResolvedValue(episode),
      findSeriesById: vi.fn().mockResolvedValue(series)
    });

    await request(createApp({ contentSeriesRepository: repository }))
      .post(`/series/${series._id}/episodes/${episode._id}/convert-case`)
      .send({ caseId: "job_001" })
      .expect(409);
  });

  it("converts approved episode ideas into a case seed", async () => {
    const series = createSeries({
      continuityRules: "Episode 2 must continue the unresolved apology conflict and end with a new classroom misunderstanding.",
      dramaIntensity: "melodrama",
      narrativeMode: "serialized",
      referenceAssetIds: ["asset_character", "asset_scene"],
      storyWorldId: "world_001"
    });
    const episode = createEpisode({
      lessonOrTheme: "è¯šå®ž",
      continuityNote: "This episode follows the previous broken picture frame incident.",
      selectedCharacterAssetIds: ["asset_character"],
      selectedSceneAssetIds: ["asset_scene"],
      serialHook: "The next episode reveals another friend saw the accident.",
      status: "approved"
    });
    const convertedEpisode = {
      ...episode,
      caseId: "job_abc123",
      status: "converted_to_case" as const
    };
    const storyWorld = createStoryWorld({
      _id: "world_001",
      description: "彩虹森林里所有故事都发生在森林学校和蘑菇广场。",
      name: "彩虹森林世界观",
      relationshipMap: "米米兔和虎虎是同班同学。"
    });
    const repository = createSeriesRepositoryMock({
      findEpisodeIdea: vi.fn().mockResolvedValue(episode),
      findSeriesById: vi.fn().mockResolvedValue(series),
      patchEpisodeIdea: vi.fn().mockResolvedValue(convertedEpisode)
    });
    const storyWorldsRepository = createStoryWorldsRepositoryMock(storyWorld);

    const response = await request(createApp({ contentSeriesRepository: repository, storyWorldsRepository }))
      .post(`/series/${series._id}/episodes/${episode._id}/convert-case`)
      .send({ caseId: "job_abc123" })
      .expect(201);

    expect(response.body).toMatchObject({
      caseSeed: {
        episodeId: episode._id,
        id: "job_abc123",
        characterAssetIds: ["asset_character"],
        sceneAssetIds: ["asset_scene"],
        storyWorldId: "world_001",
        productionBrief: expect.objectContaining({
          episodeContext: expect.objectContaining({
            continuityNote: "This episode follows the previous broken picture frame incident.",
            serialHook: "The next episode reveals another friend saw the accident."
          }),
          lessonOrTheme: "è¯šå®ž",
          selectedCharacters: [expect.objectContaining({ assetId: "asset_character" })],
          selectedScenes: [expect.objectContaining({ assetId: "asset_scene" })],
          seriesContext: expect.objectContaining({
            continuityRules: "Episode 2 must continue the unresolved apology conflict and end with a new classroom misunderstanding.",
            dramaIntensity: "melodrama",
            narrativeMode: "serialized"
          }),
          storyWorldContext: expect.objectContaining({
            description: expect.stringContaining("彩虹森林"),
            name: "彩虹森林世界观",
            relationshipMap: expect.stringContaining("米米兔"),
            storyWorldId: "world_001"
          })
        }),
        referenceAssetIds: ["asset_character", "asset_scene"],
        seriesId: series._id,
        templateType: "urban_legend",
        topic: episode.title
      },
      status: "EPISODE_CONVERTED_TO_CASE"
    });
  });

  it("keeps series reference assets generic when episode does not pin character or scene roles", async () => {
    const series = createSeries({
      referenceAssetIds: ["asset_character", "asset_scene"],
      storyWorldId: "world_001"
    });
    const episode = createEpisode({
      selectedCharacterAssetIds: [],
      selectedSceneAssetIds: [],
      status: "approved"
    });
    const repository = createSeriesRepositoryMock({
      findEpisodeIdea: vi.fn().mockResolvedValue(episode),
      findSeriesById: vi.fn().mockResolvedValue(series),
      patchEpisodeIdea: vi.fn().mockResolvedValue({ ...episode, caseId: "job_generic", status: "converted_to_case" })
    });

    const response = await request(createApp({ contentSeriesRepository: repository }))
      .post(`/series/${series._id}/episodes/${episode._id}/convert-case`)
      .send({ caseId: "job_generic" })
      .expect(201);

    expect(response.body.caseSeed).toMatchObject({
      characterAssetIds: [],
      sceneAssetIds: [],
      referenceAssetIds: ["asset_character", "asset_scene"]
    });
    expect(response.body.caseSeed.productionBrief.selectedCharacters).toEqual([]);
    expect(response.body.caseSeed.productionBrief.selectedScenes).toEqual([]);
  });
});

function createSeriesRepositoryMock(overrides: Partial<ContentSeriesRepository> = {}): ContentSeriesRepository {
  const series = createSeries();
  const episodes: SeriesEpisodeIdea[] = [];

  return {
    createEpisodeIdeas: vi.fn(async (_seriesId: string, ideas: SeriesEpisodeIdeaCreateInput[]) => ideas.map((idea, index) => createEpisodeFromInput(idea, `episode_${index + 1}`))),
    createSeries: vi.fn(async (input) => createSeries(input)),
    deleteSeries: vi.fn().mockResolvedValue(true),
    ensureIndexes: vi.fn(),
    findEpisodeIdea: vi.fn(async (_seriesId, episodeId) => episodes.find((episode) => episode._id === episodeId) ?? null),
    findSeriesById: vi.fn().mockResolvedValue(series),
    listEpisodeIdeas: vi.fn().mockResolvedValue(episodes),
    listSeries: vi.fn().mockResolvedValue([series]),
    patchEpisodeIdea: vi.fn(async (_seriesId, episodeId, patch) => createEpisode({ _id: episodeId, ...patch })),
    patchSeries: vi.fn(async (id, patch) => createSeries({ _id: id, ...patch })),
    ...overrides
  } as unknown as ContentSeriesRepository;
}

function createStoryWorldsRepositoryMock(storyWorld: StoryWorld | null = null): StoryWorldsRepository {
  return {
    create: vi.fn(),
    delete: vi.fn(),
    ensureIndexes: vi.fn(),
    findById: vi.fn(async () => storyWorld),
    list: vi.fn(async () => storyWorld ? [storyWorld] : []),
    patch: vi.fn()
  } as unknown as StoryWorldsRepository;
}

function createStoryWorld(overrides: Partial<StoryWorld> = {}): StoryWorld {
  const now = "2026-05-31T00:00:00.000Z";

  return {
    _id: overrides._id ?? "world_001",
    createdAt: overrides.createdAt ?? now,
    defaultSceneAssetIds: overrides.defaultSceneAssetIds ?? [],
    description: overrides.description ?? "一间原创办公室。",
    name: overrides.name ?? "原创世界观",
    recurringCharacterAssetIds: overrides.recurringCharacterAssetIds ?? [],
    relationshipMap: overrides.relationshipMap ?? "",
    safetyRules: overrides.safetyRules ?? "保持原创。",
    seriesIds: overrides.seriesIds ?? [],
    status: overrides.status ?? "active",
    updatedAt: overrides.updatedAt ?? now,
    visualStyle: overrides.visualStyle ?? "轻喜剧"
  };
}

function createSeries(overrides: Partial<ContentSeries> = {}): ContentSeries {
  const now = "2026-05-31T00:00:00.000Z";

  return {
    _id: overrides._id ?? "series_001",
    continuityRules: overrides.continuityRules ?? "Carry forward the unresolved conflict across episodes.",
    audience: overrides.audience ?? "创业者 / 内容运营",
    contentType: overrides.contentType ?? "AI 工具科普",
    createdAt: overrides.createdAt ?? now,
    dramaIntensity: overrides.dramaIntensity ?? "medium",
    description: overrides.description ?? "用短故事讲清楚 AI 工具的真实落地场景。",
    durationSeconds: overrides.durationSeconds ?? 45,
    language: overrides.language ?? "zh-CN",
    narrativeMode: overrides.narrativeMode ?? "standalone",
    musicStyle: overrides.musicStyle ?? "现代、简洁、轻节奏",
    name: overrides.name ?? "AI 工具实战系列",
    referenceAssetIds: overrides.referenceAssetIds ?? [],
    safetyRules: overrides.safetyRules ?? "原创、不夸大收益、不伪造真实案例。",
    sceneCount: overrides.sceneCount ?? 5,
    status: overrides.status ?? "draft",
    storyWorldId: overrides.storyWorldId ?? null,
    tone: overrides.tone ?? "专业、清楚、有案例感",
    updatedAt: overrides.updatedAt ?? now,
    values: overrides.values ?? "实用、可信、可落地",
    visualStyle: overrides.visualStyle ?? "现代 SaaS / 工作流场景"
  };
}

function createEpisode(overrides: Partial<SeriesEpisodeIdea> = {}): SeriesEpisodeIdea {
  const now = "2026-05-31T00:00:00.000Z";

  return {
    _id: overrides._id ?? "episode_001",
    ageRange: overrides.ageRange ?? "创业者",
    caseId: overrides.caseId ?? null,
    continuityNote: overrides.continuityNote ?? "",
    createdAt: overrides.createdAt ?? now,
    episodeNo: overrides.episodeNo ?? 1,
    serialHook: overrides.serialHook ?? "",
    interactiveEnding: overrides.interactiveEnding ?? "å¦‚æžœæ˜¯ä½ ï¼Œä½ ä¼šåœ¨å“ªä¸ªçŽ¯èŠ‚å¢žåŠ äººå·¥å®¡æ ¸ï¼Ÿ",
    lessonOrTheme: overrides.lessonOrTheme ?? "è‡ªåŠ¨åŒ–ä¹Ÿéœ€è¦å®¡æ ¸èŠ‚ç‚¹",
    moralLesson: overrides.moralLesson ?? "理解 AI 自动化的真实边界",
    promptSeed: overrides.promptSeed ?? "小团队误用自动化导致内容出错，最后建立人工审核节点。",
    riskNotes: overrides.riskNotes ?? "低风险",
    seriesId: overrides.seriesId ?? "series_001",
    selectedCharacterAssetIds: overrides.selectedCharacterAssetIds ?? [],
    selectedSceneAssetIds: overrides.selectedSceneAssetIds ?? [],
    sourceStory: overrides.sourceStory ?? "原创商业场景",
    status: overrides.status ?? "draft",
    synopsis: overrides.synopsis ?? "团队从盲目自动化改成关键节点审核，效率和质量都提升。",
    title: overrides.title ?? "自动化不是全自动",
    updatedAt: overrides.updatedAt ?? now
  };
}

function createEpisodeFromInput(input: SeriesEpisodeIdeaCreateInput, id: string): SeriesEpisodeIdea {
  return createEpisode({
    _id: id,
    ageRange: input.ageRange ?? "",
    caseId: input.caseId ?? null,
    continuityNote: input.continuityNote ?? "",
    episodeNo: input.episodeNo ?? 1,
    interactiveEnding: input.interactiveEnding ?? "",
    lessonOrTheme: input.lessonOrTheme ?? "",
    moralLesson: input.moralLesson,
    promptSeed: input.promptSeed,
    riskNotes: input.riskNotes ?? "",
    serialHook: input.serialHook ?? "",
    seriesId: input.seriesId ?? "series_001",
    selectedCharacterAssetIds: input.selectedCharacterAssetIds ?? [],
    selectedSceneAssetIds: input.selectedSceneAssetIds ?? [],
    sourceStory: input.sourceStory ?? "",
    status: input.status ?? "draft",
    synopsis: input.synopsis,
    title: input.title
  });
}
