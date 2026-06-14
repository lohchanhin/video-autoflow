import { mkdtemp } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import request from "supertest";
import { afterEach, describe, expect, it, vi } from "vitest";
import { createStorageAdapter } from "@ai-content-factory/storage";
import { createApp } from "../src/app.js";
import { createScriptStoryService } from "../src/modules/generation/script-story-service.js";

describe("POST /generation/script", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("generates script and storyboard artifacts without requiring OpenAI in tests", async () => {
    const uploadsDir = await mkdtemp(path.join(os.tmpdir(), "ai-content-factory-script-test-"));
    const storage = createStorageAdapter({
      apiPublicBaseUrl: "http://localhost:4000",
      uploadsDir
    });

    const scriptStoryService = createScriptStoryService({
      allowLocalFallback: true,
      openai: {
        apiKey: undefined,
        baseUrl: "https://api.openai.com/v1",
        model: "local-test",
        usdToMyrRate: 3.95
      },
      storage
    });

    const response = await request(createApp({ scriptStoryService, storage }))
      .post("/generation/script")
      .send({
        costLimitRM: 7.5,
        durationSeconds: 12,
        jobId: "job_script_test",
        language: "zh-CN",
        prompt: "Create a fictional rules horror short.",
        sceneCount: 3,
        templateType: "rules_horror",
        topic: "凌晨三点的电梯规则"
      })
      .expect(201);

    expect(response.body).toMatchObject({
      jobId: "job_script_test",
      provider: expect.any(String),
      status: "STORYBOARD_DONE",
      artifacts: {
        script: {
          publicUrl: "http://localhost:4000/uploads/jobs/job_script_test/script.json"
        },
        storyboard: {
          publicUrl: "http://localhost:4000/uploads/jobs/job_script_test/storyboard.json"
        }
      }
    });
    expect(response.body.script.title).toEqual(expect.any(String));
    expect(response.body.storyboard).toHaveLength(3);
    expect(response.body.backgroundMusic).toMatchObject({
      enabled: true,
      instrumentation: expect.any(String),
      mood: expect.any(String),
      prompt: expect.stringContaining(response.body.script.title),
      style: expect.any(String),
      tempo: expect.any(String)
    });
    expect(response.body.artifacts.visualBible.publicUrl).toBe("http://localhost:4000/uploads/jobs/job_script_test/visual-bible.json");
    expect(response.body.visualBible.character).toMatchObject({
      ageRange: expect.any(String),
      name: expect.any(String),
      wardrobe: expect.any(String)
    });
    expect(response.body.visualBible.negativePrompt).toContain("no text");
    expect(response.body.interpretedIdea).toMatchObject({
      expandedPremise: expect.any(String),
      protagonist: expect.any(String)
    });
    expect(response.body.outlineQc).toMatchObject({
      status: expect.any(String),
      summary: expect.any(String)
    });
  });

  it("expands a generic topic into a concrete premise and rewrites scaffolded outlines", async () => {
    const uploadsDir = await mkdtemp(path.join(os.tmpdir(), "ai-content-factory-script-test-"));
    const storage = createStorageAdapter({
      apiPublicBaseUrl: "http://localhost:4000",
      uploadsDir
    });
    const topic = "恐怖";
    const fetchMock = vi.fn(async () => {
      const firstDraft = fetchMock.mock.calls.length === 1;
      const payload = firstDraft ? buildBadGenericHorrorDraft(topic) : buildGoodExpandedHorrorDraft(topic);

      return new Response(JSON.stringify({
        output_text: JSON.stringify(payload),
        usage: {
          input_tokens: 100,
          output_tokens: 200
        }
      }), { status: 200 });
    });

    vi.stubGlobal("fetch", fetchMock);

    const scriptStoryService = createScriptStoryService({
      openai: {
        apiKey: "test-key",
        baseUrl: "https://api.openai.com/v1",
        model: "gpt-test",
        usdToMyrRate: 3.95
      },
      storage
    });

    const response = await scriptStoryService.generateScriptStory({
      costLimitRM: 7.5,
      durationSeconds: 45,
      jobId: "job_idea_expansion_test",
      language: "zh-CN",
      prompt: "用户只输入一个类型，系统要自动补完整故事。",
      sceneCount: 5,
      templateType: "urban_legend",
      topic
    });

    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(response.interpretedIdea.expandedPremise).toContain("旧录影机");
    expect(response.interpretedIdea.expandedPremise).not.toBe(topic);
    expect(response.outlineQc.status, JSON.stringify(response.outlineQc, null, 2)).toBe("pass");
    expect(response.requiresReview).toBe(false);
    const visibleOutput = [
      response.script.title,
      response.script.hook,
      response.script.voiceover,
      ...response.storyboard.flatMap((scene) => [scene.visual, scene.voiceText, scene.imagePrompt])
    ].join("\n");
    expect(visibleOutput).not.toContain("这是关于");
    expect(visibleOutput).not.toContain("围绕");
    expect(visibleOutput).not.toContain("Scene narration for");
    expect(response.script.title).not.toMatch(/^恐怖[:：]/u);
  });

  it("does not force non-horror topics into a rumor or rules-horror hook", async () => {
    const uploadsDir = await mkdtemp(path.join(os.tmpdir(), "ai-content-factory-comedy-lock-test-"));
    const storage = createStorageAdapter({
      apiPublicBaseUrl: "http://localhost:4000",
      uploadsDir
    });
    const topic = "kitchen comedy";

    vi.stubGlobal(
      "fetch",
      vi.fn(async () => new Response(JSON.stringify({
        output_text: JSON.stringify(buildGoodComedyDraft(topic)),
        usage: {
          input_tokens: 100,
          output_tokens: 200
        }
      }), { status: 200 }))
    );

    const scriptStoryService = createScriptStoryService({
      openai: {
        apiKey: "test-key",
        baseUrl: "https://api.openai.com/v1",
        model: "gpt-test",
        usdToMyrRate: 3.95
      },
      storage
    });

    const response = await scriptStoryService.generateScriptStory({
      costLimitRM: 7.5,
      durationSeconds: 45,
      jobId: "job_comedy_lock_test",
      language: "en-US",
      prompt: "Create a clean comedy short.",
      sceneCount: 5,
      templateType: "comedy_sketch",
      topic
    });

    expect(response.script.hook.toLowerCase()).not.toContain("rumor");
    expect(response.script.hook.toLowerCase()).not.toContain("curse");
    expect(response.script.hook).not.toContain("传闻");
    expect(response.interpretedIdea.genre).toContain("comedy");
    expect(response.outlineQc.status, JSON.stringify(response.outlineQc, null, 2)).toBe("pass");
    expect(response.visualBible.character.name).toBe("Kai");
  });

  it("uses structured production brief characters and scenes as script constraints", async () => {
    const uploadsDir = await mkdtemp(path.join(os.tmpdir(), "ai-content-factory-production-brief-test-"));
    const storage = createStorageAdapter({
      apiPublicBaseUrl: "http://localhost:4000",
      uploadsDir
    });
    const fetchMock = vi.fn(async (_url: string | URL | Request, _init?: RequestInit) => new Response(JSON.stringify({
      output_text: JSON.stringify(buildGoodStructuredBriefDraft()),
      usage: {
        input_tokens: 160,
        output_tokens: 260
      }
    }), { status: 200 }));

    vi.stubGlobal("fetch", fetchMock);

    const scriptStoryService = createScriptStoryService({
      openai: {
        apiKey: "test-key",
        baseUrl: "https://api.openai.com/v1",
        model: "gpt-test",
        usdToMyrRate: 3.95
      },
      storage
    });

    const response = await scriptStoryService.generateScriptStory({
      costLimitRM: 7.5,
      durationSeconds: 60,
      jobId: "job_production_brief_test",
      language: "zh-CN",
      productionBrief: {
        goal: "生成一集围绕诚实选择的短剧",
        lessonOrTheme: "诚实",
        selectedCharacters: [
          {
            assetId: "asset_rabbit",
            label: "兔子米米",
            role: "主角",
            visualIdentity: "白色小兔，粉色蝴蝶结，善良但会紧张"
          }
        ],
        selectedScenes: [
          {
            assetId: "asset_rainbow_forest",
            label: "彩虹森林",
            location: "彩虹森林小教室",
            visualRules: "柔和童话森林，彩虹拱门，小木桌，蘑菇路牌"
          }
        ],
        storyWorldContext: {
          description: "彩虹森林里，动物同学每天用小事件学习生活选择。",
          name: "彩虹森林"
        },
        visualContinuityRules: ["必须使用兔子米米", "必须发生在彩虹森林"]
      },
      prompt: "使用已选角色和场景，不要换主角或地点。",
      sceneCount: 3,
      templateType: "fairy_tale",
      topic: "不是我的错"
    });

    const requestInit = fetchMock.mock.calls[0]?.[1] as RequestInit | undefined;
    const requestBody = JSON.parse(String(requestInit?.body ?? "{}")) as { input?: string };
    expect(requestBody.input).toContain("Structured productionBrief is authoritative");
    expect(requestBody.input).toContain("兔子米米");
    expect(requestBody.input).toContain("彩虹森林");
    expect(response.outlineQc.status, JSON.stringify(response.outlineQc, null, 2)).toBe("pass");
    expect(response.script.title).toContain("兔子米米");
    expect(response.storyboard.map((scene) => scene.visual).join("\n")).toContain("彩虹森林");
  });
  it("treats series-bound assets as a reusable library instead of requiring every asset in one episode", async () => {
    const uploadsDir = await mkdtemp(path.join(os.tmpdir(), "ai-content-factory-series-library-test-"));
    const storage = createStorageAdapter({
      apiPublicBaseUrl: "http://localhost:4000",
      uploadsDir
    });
    const fetchMock = vi.fn(async (_url: string | URL | Request, _init?: RequestInit) => new Response(JSON.stringify({
      output_text: JSON.stringify(buildGoodSerializedFruitDraft()),
      usage: {
        input_tokens: 220,
        output_tokens: 360
      }
    }), { status: 200 }));

    vi.stubGlobal("fetch", fetchMock);

    const scriptStoryService = createScriptStoryService({
      openai: {
        apiKey: "test-key",
        baseUrl: "https://api.openai.com/v1",
        model: "gpt-test",
        usdToMyrRate: 3.95
      },
      storage
    });

    const response = await scriptStoryService.generateScriptStory({
      costLimitRM: 7.5,
      durationSeconds: 60,
      jobId: "job_series_library_test",
      language: "zh-CN",
      productionBrief: {
        goal: "生成水果八点档连续剧的一集",
        lessonOrTheme: "甜品店秘密揭幕",
        selectedCharacters: [
          {
            assetId: "asset_banana_ceo",
            label: "香蕉人",
            role: "冷面总裁",
            visualIdentity: "香蕉拟人总裁，金色西装，冷峻表情"
          },
          {
            assetId: "asset_rival_ceo",
            label: "反派总裁",
            role: "竞争者",
            visualIdentity: "深色西装，笑容危险"
          },
          {
            assetId: "asset_white_moonlight",
            label: "白月光",
            role: "旧日线索",
            visualIdentity: "白色礼服，温柔但神秘"
          },
          {
            assetId: "asset_green_apple",
            label: "青苹果",
            role: "集团助理",
            visualIdentity: "青绿色套装，敏锐观察"
          }
        ],
        selectedScenes: [
          {
            assetId: "asset_peach_dessert_shop",
            label: "水蜜桃甜品店",
            location: "隐藏在商业区后巷的水蜜桃甜品店",
            visualRules: "粉金色甜品柜，玻璃橱窗，夜晚霓虹反光"
          },
          {
            assetId: "asset_ceo_office",
            label: "CEO办公室",
            location: "高层玻璃办公室",
            visualRules: "黑金办公桌，城市夜景"
          },
          {
            assetId: "asset_mansion",
            label: "豪宅外观",
            location: "豪宅门口",
            visualRules: "雨夜车灯和铁门"
          }
        ],
        seriesContext: {
          continuityRules: "连续剧主线：香蕉总裁表面冷酷，正在寻找多年前救过自己的神秘甜品师；女主是秘密甜品店员。单集不需要出现所有系列资产，但不能把香蕉总裁换成橘子总裁。",
          description: "水果拟人版都市豪门短剧",
          dramaIntensity: "melodrama",
          name: "水果八点档",
          narrativeMode: "serialized",
          tone: "情绪浓烈，对白直接，每集结尾留钩子",
          values: "秘密、误会、反转、情感拉扯",
          visualStyle: "现代都市，豪华商业区，电影级3D动画"
        },
        visualContinuityRules: [
          "香蕉总裁必须保持香蕉拟人身份",
          "本集核心地点是水蜜桃甜品店",
          "系列资产库中的角色不需要每集全部登场"
        ]
      },
      prompt: "第三集：甜品店秘密揭幕但留下更大反转。",
      sceneCount: 3,
      templateType: "romance_story",
      topic: "命运揭幕：秘密的甜品店员"
    });

    expect(fetchMock).toHaveBeenCalled();
    expect(response.outlineQc.status, JSON.stringify(response.outlineQc, null, 2)).toBe("pass");
    expect(response.script.title).toContain("香蕉");
    expect(response.storyboard.map((scene) => scene.visual).join("\n")).toContain("水蜜桃甜品店");
    expect(JSON.stringify(response.outlineQc)).not.toContain("反派总裁");
    expect(JSON.stringify(response.outlineQc)).not.toContain("CEO办公室");
  });
});

function buildBadGenericHorrorDraft(topic: string) {
  return {
    backgroundMusic: {
      enabled: true,
      instrumentation: "strings",
      mood: "mysterious",
      prompt: "Instrumental background music for horror.",
      style: "horror",
      tempo: "slow"
    },
    interpretedIdea: {
      centralObject: "恐怖",
      conflict: "恐怖",
      endingHook: "恐怖",
      escalation: "恐怖",
      expandedPremise: "恐怖",
      genre: "horror",
      logline: "恐怖",
      protagonist: "主角",
      rawTopic: topic,
      ruleOrConstraint: "恐怖",
      setting: "房间",
      twist: "恐怖"
    },
    script: {
      hook: "这是关于「恐怖」的故事。旧录影机突然自动播放。",
      title: "恐怖：录影机里的诡异咒语",
      voiceover: "Scene narration for \"恐怖\". 声音侵入心灵，气氛变得恐怖。"
    },
    storyboard: [
      {
        camera: "close up",
        durationSeconds: 9,
        imagePrompt: "Topic: 恐怖. 气氛恐怖的画面。",
        sceneId: 1,
        sfx: ["static"],
        visual: "围绕「恐怖」的画面。气氛变得恐怖。",
        voiceText: "Scene narration for \"恐怖\"."
      }
    ],
    visualBible: baseVisualBible()
  };
}

function buildGoodExpandedHorrorDraft(topic: string) {
  return {
    backgroundMusic: {
      enabled: true,
      instrumentation: "low strings, analog synth pulse",
      mood: "tense and quiet",
      prompt: "Slow analog suspense underscore for an old camcorder story, no vocals, no melody copy.",
      style: "modern analog suspense",
      tempo: "slow"
    },
    interpretedIdea: {
      centralObject: "一台会播放明天录像的旧录影机",
      conflict: "阿明看见录像里自己明晚从客厅消失，却发现每次暂停都会让消失时间提前。",
      endingHook: "最后一帧里，电视倒影中有人站在他身后按下录影键。",
      escalation: "录像从空房间变成阿明的背影，再变成门锁自己转动。",
      expandedPremise: "旧录影机播放出主角明天失踪前的录像，主角越想停止播放，失踪时间越提前。",
      genre: "low-gore horror suspense",
      logline: "雨夜里，成年剪辑师阿明修复旧录影机，却看见自己明天失踪的录像。",
      protagonist: "成年剪辑师阿明",
      rawTopic: topic,
      ruleOrConstraint: "不能按暂停；每按一次，录像里的失踪时间就提前一小时。",
      setting: "雨夜的旧公寓客厅",
      twist: "录影机不是记录未来，而是在等待现实补上最后一帧。"
    },
    script: {
      hook: "阿明修好那台旧录影机时，电视里出现的是明天晚上的自己。",
      title: "旧录影机正在播放我明天失踪的画面",
      voiceover: "阿明只是想修好一台旧录影机。第一段录像里，他看见明天的客厅空无一人。第二段里，他自己的背影站在电视前，手里握着遥控器。机器旁贴着一行小字：不要暂停。阿明还是按了暂停。时间码立刻从明晚十一点跳到今晚十一点。门锁自己转动，电视倒影里，一个人站在他身后，替他按下了录影键。"
    },
    storyboard: [
      {
        camera: "close up",
        durationSeconds: 8,
        imagePrompt: "成年男子阿明站在雨夜公寓客厅里，右手按下旧录影机播放键，电视屏幕亮起模糊的明天日期，单一电影画面，无文字无字幕。",
        sceneId: 1,
        sfx: ["rain", "static click"],
        visual: "阿明按下旧录影机播放键，电视屏幕亮起模糊的明天日期。",
        voiceText: "阿明只是想修好一台旧录影机。"
      },
      {
        camera: "medium shot",
        durationSeconds: 9,
        imagePrompt: "阿明僵在电视前，画面里另一个阿明背对镜头站在同一间客厅，遥控器握在手里，雨光映在窗上，单一电影画面，无文字。",
        sceneId: 2,
        sfx: ["low hum"],
        visual: "阿明看见录像中的自己背对镜头站在同一间客厅里。",
        voiceText: "第二段里，他自己的背影站在电视前。"
      }
    ],
    visualBible: baseVisualBible()
  };
}

function buildGoodComedyDraft(topic: string) {
  return {
    backgroundMusic: {
      enabled: true,
      instrumentation: "light percussion",
      mood: "playful",
      prompt: "Playful kitchen underscore.",
      style: "comedy underscore",
      tempo: "medium"
    },
    interpretedIdea: {
      centralObject: "same cooking pot",
      conflict: "A cook fixes one tiny kitchen mistake and causes three harmless misunderstandings.",
      endingHook: "The quiet neighbor reveals the pot was never plugged in.",
      escalation: "Each fix creates a more visible kitchen gag.",
      expandedPremise: "An adult home cook tries to save a simple lunch, but every quick fix makes the kitchen comedy more absurd.",
      genre: "clean comedy sketch",
      logline: "A harmless kitchen mistake snowballs into a visual comedy of wrong assumptions.",
      protagonist: "adult home cook Kai",
      rawTopic: topic,
      ruleOrConstraint: "Kai cannot admit the first mistake until lunch is served.",
      setting: "small bright kitchen",
      twist: "Everyone blamed the recipe, but the pot was unplugged."
    },
    script: {
      hook: "A tiny problem escalates before lunch.",
      title: "Lunch Goes Sideways",
      voiceover: "Kai tries to save lunch before friends arrive. First he drops a spoon, then he hides the wrong pot, then everyone starts fixing different problems at once. The kitchen gets messier, but nobody gets hurt. In the last beat, the quiet neighbor points at the plug. The pot was never plugged in."
    },
    storyboard: [
      {
        camera: "wide comedy frame",
        durationSeconds: 9,
        imagePrompt: "Adult home cook Kai drops a spoon beside the same cooking pot in a bright kitchen, expressive clean comedy still, no text.",
        sceneId: 1,
        sfx: ["pan clink"],
        visual: "Kai drops a spoon beside the same cooking pot while trying to hide a harmless mistake.",
        voiceText: "The mistake looked tiny at first."
      }
    ],
    visualBible: {
      character: {
        ageRange: "adult, 30s",
        bodyType: "average build",
        expressionRange: "surprised to relieved",
        fixedProps: ["same apron"],
        hair: "short black hair",
        name: "Kai",
        role: "home cook",
        signatureDetails: "same face and apron",
        wardrobe: "blue apron over white shirt"
      },
      environment: {
        keyObjects: ["same pan"],
        lighting: "warm daylight",
        location: "small kitchen",
        palette: "warm neutrals",
        recurringDetails: "same small kitchen"
      },
      negativePrompt: "no text, no panels",
      style: "single cinematic comedy still"
    }
  };
}

function buildGoodStructuredBriefDraft() {
  return {
    backgroundMusic: {
      enabled: true,
      instrumentation: "木琴、轻柔弦乐",
      mood: "温暖、轻快",
      prompt: "适合彩虹森林诚实主题的温暖儿童短剧配乐，无人声。",
      style: "温暖童话短剧",
      tempo: "medium"
    },
    interpretedIdea: {
      centralObject: "掉落的彩色画框",
      conflict: "兔子米米撞倒画框后想躲起来，但诚实主题推动她主动承认。",
      endingHook: "猫头鹰老师问观众，如果是你会怎么做。",
      escalation: "彩虹森林同学开始找原因，米米越来越不安。",
      expandedPremise: "在彩虹森林，兔子米米不小心撞倒画框，她必须在害怕被责怪和诚实承认之间做选择。",
      genre: "温和教育短剧",
      logline: "兔子米米在彩虹森林学会诚实承认错误。",
      protagonist: "兔子米米",
      rawTopic: "不是我的错",
      ruleOrConstraint: "不能换主角，不能离开彩虹森林。",
      setting: "彩虹森林小教室",
      twist: "老师没有责怪米米，而是肯定她的诚实。"
    },
    script: {
      hook: "兔子米米在彩虹森林撞倒了最漂亮的画框，她第一句话差点说：不是我的错。",
      title: "兔子米米：不是我的错",
      voiceover: "彩虹森林的小教室里，兔子米米追着蝴蝶跑过小木桌。砰的一声，彩色画框掉在软草地上。米米吓得耳朵都竖起来，悄悄坐回座位。朋友问是谁碰倒的，她低下头，心里越来越难受。猫头鹰老师回来后没有生气，只问谁愿意说实话。米米站起来说，对不起，是我不小心。老师微笑着说，诚实承认错误，比假装没发生更勇敢。"
    },
    storyboard: [
      {
        camera: "wide shot",
        durationSeconds: 10,
        imagePrompt: "兔子米米在彩虹森林小教室追蝴蝶，彩虹拱门和小木桌清楚可见，单一电影画面，无文字。",
        sceneId: 1,
        sfx: ["轻快脚步", "蝴蝶拍翅"],
        visual: "兔子米米在彩虹森林小教室追蝴蝶，跑过小木桌。",
        voiceText: "彩虹森林的小教室里，兔子米米追着蝴蝶跑过小木桌。"
      },
      {
        camera: "medium shot",
        durationSeconds: 12,
        imagePrompt: "兔子米米看着彩虹森林小教室里掉落的彩色画框，表情紧张，单一电影画面，无文字。",
        sceneId: 2,
        sfx: ["轻微碰撞", "短暂停顿"],
        visual: "彩色画框掉在彩虹森林小教室地上，兔子米米紧张地看着。",
        voiceText: "砰的一声，彩色画框掉在软草地上。米米吓得耳朵都竖起来。"
      },
      {
        camera: "close up",
        durationSeconds: 14,
        imagePrompt: "兔子米米在彩虹森林小教室向猫头鹰老师承认错误，老师温柔微笑，单一电影画面，无文字。",
        sceneId: 3,
        sfx: ["温暖提示音"],
        visual: "兔子米米在彩虹森林小教室站起来，向猫头鹰老师诚实承认。",
        voiceText: "米米站起来说，对不起，是我不小心。诚实承认错误，比假装没发生更勇敢。"
      }
    ],
    visualBible: {
      character: {
        ageRange: "fictional childlike rabbit character",
        bodyType: "small round mascot body",
        expressionRange: "nervous, relieved, brave",
        fixedProps: ["pink bow"],
        hair: "white fluffy fur",
        name: "兔子米米",
        role: "主角",
        signatureDetails: "白色小兔、粉色蝴蝶结、蓝色背带裙",
        wardrobe: "蓝色背带裙和粉色蝴蝶结"
      },
      environment: {
        keyObjects: ["彩虹拱门", "小木桌", "彩色画框"],
        lighting: "soft daylight",
        location: "彩虹森林小教室",
        palette: "pastel rainbow colors",
        recurringDetails: "彩虹森林拱门和蘑菇路牌"
      },
      negativePrompt: "no text, no captions, no UI, no panels",
      style: "single vertical storybook cinematic still"
    }
  };
}

function buildGoodSerializedFruitDraft() {
  return {
    backgroundMusic: {
      enabled: true,
      instrumentation: "钢琴、弦乐、低频鼓点",
      mood: "浓烈、悬疑、拉扯",
      prompt: "都市豪门水果拟人短剧背景音乐，钢琴和弦乐制造秘密揭幕的紧张感，低频鼓点在反转处推进，无人声。",
      style: "都市狗血连续剧",
      tempo: "medium"
    },
    interpretedIdea: {
      centralObject: "刻着香蕉集团旧标志的甜品配方卡",
      conflict: "香蕉总裁发现秘密甜品店员手里的配方卡，怀疑她就是多年前救过自己的人，却又怕她接近自己另有目的。",
      endingHook: "配方卡背面露出一个从未公开的家族印章。",
      escalation: "甜品店停电、账本掉落、香蕉总裁看见配方卡上的旧伤痕暗号。",
      expandedPremise: "香蕉总裁夜访水蜜桃甜品店，发现秘密甜品店员的配方卡和自己失踪多年的救命线索完全吻合。",
      genre: "serialized urban melodrama",
      logline: "香蕉总裁在水蜜桃甜品店发现女主隐藏的身份线索，误会和心动同时升级。",
      protagonist: "香蕉总裁",
      rawTopic: "命运揭幕：秘密的甜品店员",
      ruleOrConstraint: "不能更换香蕉总裁和水蜜桃甜品店，结尾必须留下下一集钩子。",
      setting: "水蜜桃甜品店",
      twist: "女主不是普通店员，她保管的配方卡可能决定香蕉集团继承权。"
    },
    script: {
      hook: "香蕉总裁推开水蜜桃甜品店的门时，柜台后的秘密店员正把一张旧配方卡藏进围裙。",
      title: "香蕉总裁在甜品店认出了她的秘密",
      voiceover: "雨夜，香蕉总裁独自走进水蜜桃甜品店。秘密甜品店员刚要收起配方卡，他却看见卡角上的香蕉集团旧标志。她说这只是一张普通甜品配方，他却认出那道折痕，和多年前救他的人留下的一模一样。灯忽然灭了，账本从柜台滑落，里面夹着他的旧照片。香蕉总裁低声问，你到底是谁？她还没回答，配方卡背面露出一个从未公开的家族印章。"
    },
    storyboard: [
      {
        camera: "medium push-in",
        durationSeconds: 8,
        imagePrompt: "香蕉拟人冷面总裁推开水蜜桃甜品店玻璃门，雨夜霓虹反光，柜台后的秘密甜品店员正在藏起旧配方卡，单一电影画面，无文字无字幕。",
        sceneId: 1,
        sfx: ["雨声", "门铃"],
        visual: "香蕉总裁推开水蜜桃甜品店的玻璃门，看见店员把旧配方卡藏进围裙。",
        voiceText: "雨夜，香蕉总裁独自走进水蜜桃甜品店。"
      },
      {
        camera: "close-up",
        durationSeconds: 10,
        imagePrompt: "香蕉总裁戴着黑金手套拿起旧配方卡，卡角露出香蕉集团旧标志，秘密甜品店员紧张地看着他，粉金色甜品柜背景，单一电影画面，无文字。",
        sceneId: 2,
        sfx: ["低频鼓点", "纸张摩擦"],
        visual: "香蕉总裁拿起配方卡，认出卡角上的香蕉集团旧标志和折痕。",
        voiceText: "他却看见卡角上的香蕉集团旧标志，和多年前救他的人留下的一模一样。"
      },
      {
        camera: "dramatic reveal",
        durationSeconds: 12,
        imagePrompt: "水蜜桃甜品店突然停电，香蕉总裁伸手翻开柜台账本，一张配方卡从账本里滑出，卡片背面的神秘家族印章被手电光照亮，秘密店员隔着柜台紧张对视，单一电影画面，无文字。",
        sceneId: 3,
        sfx: ["停电声", "心跳", "反转音效"],
        visual: "灯光熄灭后，香蕉总裁伸手翻开柜台账本，配方卡滑出并露出神秘家族印章。",
        voiceText: "香蕉总裁低声问，你到底是谁？配方卡背面露出一个从未公开的家族印章。"
      }
    ],
    visualBible: {
      character: {
        ageRange: "adult, late 20s to 30s",
        bodyType: "tall elegant fruit-person silhouette",
        expressionRange: "冷峻、怀疑、动摇",
        fixedProps: ["黑金手套", "旧配方卡"],
        hair: "香蕉拟人金色发束",
        name: "香蕉总裁",
        role: "水果集团继承人",
        signatureDetails: "香蕉拟人身份、金色西装、冷面表情",
        wardrobe: "黑金剪裁西装"
      },
      environment: {
        keyObjects: ["旧配方卡", "甜品柜", "账本", "家族印章"],
        lighting: "雨夜霓虹加室内暖光",
        location: "水蜜桃甜品店",
        palette: "粉金、黑金、雨夜蓝",
        recurringDetails: "水蜜桃甜品店玻璃橱窗和粉金色柜台"
      },
      negativePrompt: "no text, no captions, no UI, no storyboard sheet, no comic panels",
      style: "single vertical cinematic 3D animated urban melodrama still"
    }
  };
}

function baseVisualBible() {
  return {
    character: {
      ageRange: "adult, early 30s",
      bodyType: "average build",
      expressionRange: "focused, confused, frightened",
      fixedProps: ["old camcorder", "black remote"],
      hair: "short black hair with neat side part",
      name: "阿明",
      role: "adult video editor trapped by a future recording",
      signatureDetails: "same face, same short hair, same dark jacket, same black remote",
      wardrobe: "dark gray jacket over plain white shirt"
    },
    environment: {
      keyObjects: ["old camcorder", "CRT television", "rainy window"],
      lighting: "blue rain light with warm table lamp",
      location: "old apartment living room",
      palette: "blue gray, amber, deep shadow",
      recurringDetails: "same sofa, same CRT television, same rainy window in every scene"
    },
    negativePrompt: "no text, no captions, no subtitles, no UI, no table, no panels",
    style: "single vertical cinematic still, analog suspense, realistic fictional adult"
  };
}
