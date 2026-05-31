import request from "supertest";
import { describe, expect, it, vi } from "vitest";
import type { CostLog, GenerateScriptStoryResponse } from "@ai-content-factory/shared-types";
import type { CostLogsRepository } from "@ai-content-factory/database";
import type { ScriptStoryService } from "../src/modules/generation/script-story-service.js";
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
      usage: {
        inputTokens: 100,
        outputTokens: 200
      }
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

function createScriptResponse(): GenerateScriptStoryResponse {
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
      outputTokens: 200
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
    }
  };
}
