import { describe, expect, it } from "vitest";
import type { ToolProviderSettings } from "./admin-data.js";
import { estimateNextCaseCost } from "./case-cost-estimates.js";
import type { AdminJob, JobProcessRecord } from "./jobs.js";

describe("case next cost estimates", () => {
  it("estimates the script/story step from the LLM fallback cost", () => {
    const estimate = estimateNextCaseCost({
      job: createJob({ actualCostRM: 0.5, costLimitRM: 7.5 }),
      readiness: {
        finalMp4Ready: false,
        imageReadyForCompose: false,
        scriptStoryReady: false,
        voiceoverReadyForCompose: false
      },
      records: [],
      settings: [createToolSetting({ fallbackCostRM: 0.18, toolType: "llm" })]
    });

    expect(estimate.stage).toBe("script");
    expect(estimate.estimatedCostRM).toBe(0.18);
    expect(estimate.pricingStatus).toBe("priced");
    expect(estimate.exceedsBudget).toBe(false);
  });

  it("estimates scene images from scene count and image unit price", () => {
    const estimate = estimateNextCaseCost({
      job: createJob({ sceneCount: 5 }),
      readiness: {
        finalMp4Ready: false,
        imageReadyForCompose: false,
        scriptStoryReady: true,
        voiceoverReadyForCompose: false
      },
      records: [],
      settings: [createToolSetting({ outputUnitPriceRM: 0.2, toolType: "image" })]
    });

    expect(estimate.stage).toBe("image");
    expect(estimate.estimatedCostRM).toBe(1);
    expect(estimate.detail).toContain("5 images");
  });

  it("shows missing price when a paid tool has no unit or fallback cost", () => {
    const estimate = estimateNextCaseCost({
      job: createJob(),
      readiness: {
        finalMp4Ready: false,
        imageReadyForCompose: true,
        scriptStoryReady: true,
        voiceoverReadyForCompose: false
      },
      records: [createRecord({ output: "这是一段已经生成的旁白文本。", stageId: "script" })],
      settings: [createToolSetting({ costMode: "character", toolType: "tts" })]
    });

    expect(estimate.stage).toBe("tts");
    expect(estimate.estimatedCostRM).toBeNull();
    expect(estimate.pricingStatus).toBe("missing_price");
  });

  it("marks the next step as over budget before the user clicks generation", () => {
    const estimate = estimateNextCaseCost({
      job: createJob({ actualCostRM: 7.25, costLimitRM: 7.5, sceneCount: 5 }),
      readiness: {
        finalMp4Ready: false,
        imageReadyForCompose: false,
        scriptStoryReady: true,
        voiceoverReadyForCompose: false
      },
      records: [],
      settings: [createToolSetting({ outputUnitPriceRM: 0.2, toolType: "image" })]
    });

    expect(estimate.estimatedCostRM).toBe(1);
    expect(estimate.remainingRM).toBe(0.25);
    expect(estimate.exceedsBudget).toBe(true);
  });

  it("treats local compose as a free priced step", () => {
    const estimate = estimateNextCaseCost({
      job: createJob(),
      readiness: {
        finalMp4Ready: false,
        imageReadyForCompose: true,
        scriptStoryReady: true,
        voiceoverReadyForCompose: true
      },
      records: [],
      settings: [createToolSetting({ costMode: "free", provider: "local", toolType: "compose" })]
    });

    expect(estimate.stage).toBe("compose");
    expect(estimate.estimatedCostRM).toBe(0);
    expect(estimate.pricingStatus).toBe("free");
  });
});

function createJob(overrides: Partial<AdminJob> = {}): AdminJob {
  const now = "2026-06-01T00:00:00.000Z";
  return {
    actualCostRM: 1,
    backgroundAssetId: null,
    characterAssetIds: [],
    characterAssetId: null,
    characterId: null,
    costLimitRM: 7.5,
    createdAt: now,
    durationSeconds: 45,
    episodeId: null,
    genre: "general",
    id: "job_cost_estimate",
    interpretedIdea: null,
    language: "zh-CN",
    outlineQc: null,
    privacy: "private",
    productionBrief: null,
    prompt: "生成一支短片。",
    reviewStatus: "draft",
    sceneCount: 5,
    sceneAssetIds: [],
    scheduleId: null,
    scheduleRunId: null,
    seriesId: null,
    source: "manual",
    status: "PENDING",
    storyWorldId: null,
    templateType: "urban_legend",
    topic: "成本测试",
    updatedAt: now,
    visualBible: null,
    ...overrides
  };
}

function createToolSetting(overrides: Partial<ToolProviderSettings>): ToolProviderSettings {
  return {
    allowAutopilot: true,
    apiStyle: "test",
    baseUrl: "https://api.example.test",
    costMode: "tokens",
    enabled: true,
    fallbackCostRM: 0,
    id: "tool_test",
    inputUnitPriceRM: 0,
    model: "test-model",
    outputUnitPriceRM: 0,
    params: {},
    pricingSource: "test",
    provider: "test",
    retryLimit: 2,
    toolType: "llm",
    updatedAt: "2026-06-01T00:00:00.000Z",
    ...overrides
  };
}

function createRecord(overrides: Partial<JobProcessRecord>): JobProcessRecord {
  return {
    artifactPath: "",
    costRM: 0,
    id: "record_test",
    input: "",
    jobId: "job_cost_estimate",
    notes: "",
    order: 1,
    output: "",
    owner: "AI Producer",
    ownerAgentId: "agent",
    provider: "openai",
    queueName: "script.queue",
    stageId: "script",
    stageName: "Script",
    status: "done",
    updatedAt: "2026-06-01T00:00:00.000Z",
    ...overrides
  };
}
