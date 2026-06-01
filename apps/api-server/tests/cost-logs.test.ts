import request from "supertest";
import { describe, expect, it, vi } from "vitest";
import type { CostLog, GenerateImagesResponse, GenerateScriptStoryResponse, GenerateTtsResponse, GenerateVideoResponse } from "@ai-content-factory/shared-types";
import type { CostLogsRepository } from "@ai-content-factory/database";
import type { ImageGenerationService } from "../src/modules/generation/image-service.js";
import type { ScriptStoryService } from "../src/modules/generation/script-story-service.js";
import type { TtsGenerationService } from "../src/modules/generation/tts-service.js";
import type { VideoGenerationService } from "../src/modules/generation/local-pipeline.js";
import { createApp } from "../src/app.js";

describe("cost logging", () => {
  it("records real provider usage after script generation", async () => {
    const costLogsRepository = createCostLogsRepositoryMock();
    const scriptStoryService = {
      generateScriptStory: vi.fn().mockResolvedValue(createScriptResponse())
    } as unknown as ScriptStoryService;

    await request(createApp({ costLogsRepository, scriptStoryService }))
      .post("/generation/script")
      .send({
        costLimitRM: 7.5,
        language: "zh-CN",
        prompt: "写一个原创短片",
        sceneCount: 5,
        templateType: "urban_legend",
        topic: "雨夜便利店"
      })
      .expect(201);

    expect(costLogsRepository.create).toHaveBeenCalledWith(expect.objectContaining({
      costRM: 0.0063,
      jobId: "job_cost_test",
      model: "gpt-4.1-mini",
      operation: "generation.script_story",
      provider: "openai",
      pricingStatus: "actual_usage",
      quantity: 300,
      service: "script",
      unit: "tokens",
      usage: expect.objectContaining({
        inputTokens: 100,
        outputTokens: 200,
        pricingMode: "token_usage"
      })
    }));
  });

  it("marks OpenAI script calls as pricing_missing when a model has token usage but no configured price", async () => {
    const costLogsRepository = createCostLogsRepositoryMock();
    const scriptStoryService = {
      generateScriptStory: vi.fn().mockResolvedValue(createScriptResponse({
        costRM: 0,
        model: "gpt-unknown-production-model",
        usage: {
          inputTokens: 100,
          outputTokens: 200,
          pricingMode: "pricing_missing"
        }
      }))
    } as unknown as ScriptStoryService;

    await request(createApp({ costLogsRepository, scriptStoryService }))
      .post("/generation/script")
      .send({
        costLimitRM: 7.5,
        language: "zh-CN",
        prompt: "写一个原创短片",
        sceneCount: 5,
        templateType: "urban_legend",
        topic: "雨夜便利店"
      })
      .expect(201);

    expect(costLogsRepository.create).toHaveBeenCalledWith(expect.objectContaining({
      costRM: 0,
      model: "gpt-unknown-production-model",
      pricingStatus: "pricing_missing",
      quantity: 300,
      service: "script",
      unit: "tokens"
    }));
  });

  it("marks OpenAI image calls as pricing_missing when no usage or configured estimate is available", async () => {
    const costLogsRepository = createCostLogsRepositoryMock();
    const imageGenerationService = {
      generateImages: vi.fn().mockResolvedValue(createImagesResponse({
        costRM: 0,
        images: [
          createImageAsset({
            usage: {
              pricingMode: "fallback_fixed_image_estimate",
              quality: "medium",
              size: "1024x1536"
            }
          })
        ],
        model: "custom-openai-image-model"
      }))
    } as unknown as ImageGenerationService;

    await request(createApp({ costLogsRepository, imageGenerationService }))
      .post("/generation/images")
      .send({
        costLimitRM: 7.5,
        jobId: "job_image_cost",
        language: "zh-CN",
        prompt: "生成一张场景图",
        sceneCount: 1,
        templateType: "urban_legend",
        topic: "雨夜便利店"
      })
      .expect(201);

    expect(costLogsRepository.create).toHaveBeenCalledWith(expect.objectContaining({
      costRM: 0,
      jobId: "job_image_cost",
      model: "custom-openai-image-model",
      operation: "generation.scene_images",
      pricingStatus: "pricing_missing",
      provider: "openai",
      quantity: 1,
      service: "image",
      unit: "image"
    }));
  });

  it("exposes MongoDB cost summaries", async () => {
    const costLogsRepository = createCostLogsRepositoryMock({
      summary: vi.fn().mockResolvedValue({
        byProvider: [{ costRM: 2.7, provider: "seedance" }],
        byService: [{ costRM: 2.7, service: "video" }],
        pricingMissingCount: 1,
        totalCostRM: 2.7,
        totalCostUSD: 0.68,
        totalLogs: 2
      })
    });

    const response = await request(createApp({ costLogsRepository }))
      .get("/costs/summary?jobId=job_cost_test")
      .expect(200);

    expect(response.body).toMatchObject({
      byProvider: [{ costRM: 2.7, provider: "seedance" }],
      jobId: "job_cost_test",
      pricingMissingCount: 1,
      totalCostRM: 2.7,
      totalLogs: 2
    });
    expect(costLogsRepository.summary).toHaveBeenCalledWith({ jobId: "job_cost_test" });
  });

  it("records compose ledger rows after final MP4 generation", async () => {
    const costLogsRepository = createCostLogsRepositoryMock();
    const generationService = {
      generateVideo: vi.fn().mockResolvedValue(createVideoResponse())
    } as unknown as VideoGenerationService;

    await request(createApp({ costLogsRepository, generationService }))
      .post("/generation/video")
      .send({
        costLimitRM: 7.5,
        durationSeconds: 23,
        jobId: "job_compose_cost",
        language: "zh-CN",
        model: "ffmpeg-local",
        prompt: "合成已生成素材",
        provider: "local_ffmpeg",
        sceneCount: 2,
        templateType: "urban_legend",
        topic: "雨夜便利店"
      })
      .expect(201);

    expect(costLogsRepository.create).toHaveBeenCalledWith(expect.objectContaining({
      costRM: 0,
      jobId: "job_compose_cost",
      model: "ffmpeg-local",
      operation: "generation.compose_video",
      provider: "local_ffmpeg",
      pricingStatus: "local_zero",
      quantity: 23,
      service: "compose",
      unit: "seconds",
      usage: {
        durationSeconds: 23,
        sceneCount: 2,
        storageDriver: "local",
        usedSceneClips: false
      }
    }));
  });

  it("marks TTS cost as pricing_missing when no TTS unit price is configured", async () => {
    const costLogsRepository = createCostLogsRepositoryMock();
    const ttsGenerationService = {
      generateTts: vi.fn().mockResolvedValue(createTtsResponse({ costRM: 0 }))
    } as unknown as TtsGenerationService;

    await request(createApp({ costLogsRepository, ttsGenerationService }))
      .post("/generation/tts")
      .send({
        costLimitRM: 7.5,
        jobId: "job_tts_cost",
        language: "zh-CN",
        voiceoverText: "测试配音"
      })
      .expect(201);

    expect(costLogsRepository.create).toHaveBeenCalledWith(expect.objectContaining({
      costRM: 0,
      jobId: "job_tts_cost",
      model: "gpt-4o-mini-tts",
      operation: "generation.tts",
      pricingStatus: "pricing_missing",
      provider: "openai",
      quantity: 4,
      service: "tts",
      unit: "characters"
    }));
  });
});

function createCostLogsRepositoryMock(overrides: Partial<CostLogsRepository> = {}): CostLogsRepository {
  return {
    create: vi.fn(async (input) => ({
      _id: "cost_001",
      costUSD: 0.0016,
      createdAt: new Date().toISOString(),
      currency: "MYR",
      ...input
    }) as CostLog),
    ensureIndexes: vi.fn(),
    list: vi.fn().mockResolvedValue([]),
    summary: vi.fn().mockResolvedValue({
      byProvider: [],
      byService: [],
      pricingMissingCount: 0,
      totalCostRM: 0,
      totalCostUSD: 0,
      totalLogs: 0
    }),
    ...overrides
  };
}

function createScriptResponse(overrides: Partial<GenerateScriptStoryResponse> = {}): GenerateScriptStoryResponse {
  return {
    artifacts: {
      script: { driver: "local", storagePath: "local://script.json" },
      storyboard: { driver: "local", storagePath: "local://storyboard.json" },
      visualBible: { driver: "local", storagePath: "local://visual-bible.json" }
    },
    backgroundMusic: {
      enabled: true,
      instrumentation: "piano",
      mood: "suspense",
      prompt: "soft suspense",
      style: "cinematic",
      tempo: "slow"
    },
    costRM: 0.0063,
    interpretedIdea: {
      centralObject: "receipt",
      conflict: "mystery",
      endingHook: "twist",
      escalation: "strange customer",
      expandedPremise: "A night shift clerk finds tomorrow's receipt.",
      genre: "urban legend",
      logline: "A clerk discovers a future receipt.",
      protagonist: "adult clerk",
      rawTopic: "雨夜便利店",
      ruleOrConstraint: "do not scan it",
      setting: "convenience store",
      twist: "the receipt belongs to him"
    },
    jobId: "job_cost_test",
    model: "gpt-4.1-mini",
    outlineQc: {
      checkedAt: new Date().toISOString(),
      checks: [],
      status: "pass",
      summary: "ok"
    },
    provider: "openai",
    requiresReview: false,
    script: {
      hook: "hook",
      title: "title",
      voiceover: "voiceover"
    },
    status: "STORYBOARD_DONE",
    storyboard: [],
    usage: {
      inputTokens: 100,
      outputTokens: 200,
      pricingMode: "token_usage"
    },
    visualBible: {
      character: {
        ageRange: "adult",
        bodyType: "average",
        expressionRange: "calm",
        fixedProps: [],
        hair: "short hair",
        name: "Lead",
        role: "protagonist",
        signatureDetails: "same outfit",
        wardrobe: "jacket"
      },
      environment: {
        keyObjects: [],
        lighting: "soft",
        location: "store",
        palette: "blue",
        recurringDetails: "rain"
      },
      negativePrompt: "no text",
      style: "cinematic"
    },
    ...overrides
  };
}

function createImagesResponse(overrides: Partial<GenerateImagesResponse> = {}): GenerateImagesResponse {
  return {
    costRM: 0,
    images: [createImageAsset()],
    jobId: "job_image_cost",
    model: "gpt-image-2",
    provider: "openai",
    requiresReview: false,
    status: "IMAGE_DONE",
    visualBible: createVisualBible(),
    ...overrides
  };
}

function createImageAsset(overrides: Partial<GenerateImagesResponse["images"][number]> = {}): GenerateImagesResponse["images"][number] {
  return {
    asset: {
      driver: "local",
      publicUrl: "http://localhost:4000/uploads/jobs/job_image_cost/images/scene_01.png",
      storagePath: "local://uploads/jobs/job_image_cost/images/scene_01.png"
    },
    costRM: 0,
    prompt: "scene image",
    sceneId: 1,
    usage: {
      pricingMode: "fallback_fixed_image_estimate",
      quality: "medium",
      size: "1024x1536"
    },
    ...overrides
  };
}

function createVisualBible(): GenerateImagesResponse["visualBible"] {
  return {
    character: {
      ageRange: "adult",
      bodyType: "average",
      expressionRange: "calm",
      fixedProps: [],
      hair: "short hair",
      name: "Lead",
      role: "protagonist",
      signatureDetails: "same outfit",
      wardrobe: "jacket"
    },
    environment: {
      keyObjects: [],
      lighting: "soft",
      location: "store",
      palette: "blue",
      recurringDetails: "rain"
    },
    negativePrompt: "no text",
    style: "cinematic"
  };
}

function createVideoResponse(): GenerateVideoResponse {
  const object = {
    driver: "local" as const,
    publicUrl: "http://localhost:4000/uploads/jobs/job_compose_cost/final/video.mp4",
    storagePath: "local://uploads/jobs/job_compose_cost/final/video.mp4"
  };

  return {
    artifacts: {
      finalVideo: object,
      sceneImages: [object, object],
      script: object,
      soundEffects: object,
      storyboard: object,
      subtitles: object,
      voiceover: object
    },
    costRM: 0,
    durationSeconds: 23,
    jobId: "job_compose_cost",
    script: {
      hook: "hook",
      title: "title",
      voiceover: "voiceover"
    },
    status: "COMPOSED",
    storyboard: [
      {
        camera: "wide",
        durationSeconds: 12,
        imagePrompt: "scene one",
        sceneId: 1,
        sfx: [],
        visual: "scene one",
        voiceText: "voice one"
      },
      {
        camera: "close",
        durationSeconds: 11,
        imagePrompt: "scene two",
        sceneId: 2,
        sfx: [],
        visual: "scene two",
        voiceText: "voice two"
      }
    ],
    storage: {
      driver: "local"
    }
  };
}

function createTtsResponse(overrides: Partial<GenerateTtsResponse> = {}): GenerateTtsResponse {
  return {
    audio: {
      driver: "local",
      publicUrl: "http://localhost:4000/uploads/jobs/job_tts_cost/audio/voiceover.mp3",
      storagePath: "local://uploads/jobs/job_tts_cost/audio/voiceover.mp3"
    },
    costRM: 0,
    format: "mp3",
    jobId: "job_tts_cost",
    model: "gpt-4o-mini-tts",
    provider: "openai",
    status: "TTS_DONE",
    usage: {
      characterCount: 4,
      pricingMode: "character_count"
    },
    voice: "cedar",
    voiceoverText: "测试配音",
    ...overrides
  };
}
