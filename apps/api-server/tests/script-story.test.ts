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
    expect(response.outlineQc.status).toBe("pass");
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
    expect(response.outlineQc.status).toBe("pass");
    expect(response.visualBible.character.name).toBe("Kai");
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
