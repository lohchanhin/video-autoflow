import { beforeEach, describe, expect, it, vi } from "vitest";
import { defaultStaffAgents } from "./agents.js";
import {
  createCaseActivity,
  createJob,
  createProcessRecordsForJob,
  createSceneReviewItems,
  loadCaseActivities,
  syncCaseReferenceAssets,
  syncProcessRecordsWithJob,
  type JobProcessRecord
} from "./jobs.js";

describe("case process records", () => {
  beforeEach(() => {
    vi.stubGlobal("localStorage", createMemoryStorage());
  });

  it("assigns the AI Producer Agent to new case stages", () => {
    const job = createJob({
      topic: "Test elevator case",
      prompt: "Create a short rules-horror story.",
      templateType: "rules_horror",
      language: "zh-CN",
      sceneCount: 5,
      costLimitRM: 7.5
    });

    const records = createProcessRecordsForJob(job, defaultStaffAgents);

    expect(records.find((record) => record.stageId === "script")?.ownerAgentId).toBe("agent_ai_producer");
    expect(records.find((record) => record.stageId === "image")?.ownerAgentId).toBe("agent_ai_producer");
    expect(records.find((record) => record.stageId === "publish")?.ownerAgentId).toBe("agent_ai_producer");
  });

  it("keeps inherited reference asset ids on a created case", () => {
    const job = createJob({
      topic: "Series episode",
      prompt: "Use the series asset library.",
      referenceAssetIds: ["asset_banana_ceo", "asset_sweet_shop", "asset_banana_ceo"],
      templateType: "comedy_sketch",
      language: "zh-CN",
      sceneCount: 5,
      costLimitRM: 50
    });

    expect(job.referenceAssetIds).toEqual(["asset_banana_ceo", "asset_sweet_shop"]);
  });

  it("normalizes legacy records without ownerAgentId", () => {
    const job = createJob({
      topic: "Legacy case",
      prompt: "Create a legacy-compatible case.",
      templateType: "rules_horror",
      language: "zh-CN",
      sceneCount: 5,
      costLimitRM: 7.5
    });

    const legacyRecords = createProcessRecordsForJob(job, defaultStaffAgents).map((record) => {
      const { notes: _notes, ownerAgentId: _ownerAgentId, ...legacyRecord } = record;
      return legacyRecord as unknown as JobProcessRecord;
    });

    const normalizedRecords = syncProcessRecordsWithJob(job, legacyRecords, defaultStaffAgents);
    const scriptRecord = normalizedRecords.find((record) => record.stageId === "script");

    expect(scriptRecord?.ownerAgentId).toBe("agent_ai_producer");
    expect(scriptRecord?.owner).toBe("AI Producer Agent");
    expect(scriptRecord?.notes).toBe("");
  });

  it("uses workflow endpoint configuration for new case records", () => {
    const job = createJob({
      topic: "Configured workflow case",
      prompt: "Create a case using edited workflow endpoints.",
      templateType: "rules_horror",
      language: "zh-CN",
      sceneCount: 5,
      costLimitRM: 7.5
    });

    const records = createProcessRecordsForJob(job, defaultStaffAgents, [
      {
        id: "tool_custom_image",
        stageIds: ["image"],
        stage: "Image generation",
        provider: "Custom Image Router",
        role: "Generate scene stills",
        endpoint: "https://example.test/image",
        localPort: "4999",
        queueName: "custom.image.queue",
        envKeys: "CUSTOM_IMAGE_KEY",
        costMode: "per image",
        status: "ready",
        enabled: true
      },
      {
        id: "tool_video",
        stageIds: ["video"],
        stage: "Video generation",
        provider: "Disabled Video Tool",
        role: "Optional motion clips",
        endpoint: "https://example.test/video",
        localPort: "4998",
        queueName: "custom.video.queue",
        envKeys: "VIDEO_KEY",
        costMode: "per second",
        status: "disabled",
        enabled: false
      }
    ]);

    const imageRecord = records.find((record) => record.stageId === "image");
    const videoRecord = records.find((record) => record.stageId === "video");

    expect(imageRecord?.provider).toBe("Custom Image Router");
    expect(imageRecord?.queueName).toBe("custom.image.queue");
    expect(videoRecord?.status).toBe("skipped");
  });

  it("keeps schedule run metadata on scheduled cases", () => {
    const job = createJob({
      costLimitRM: 7.5,
      language: "zh-CN",
      prompt: "Create scheduled content.",
      sceneCount: 5,
      scheduleId: "schedule_daily",
      scheduleRunId: "run_001",
      source: "scheduled",
      templateType: "urban_legend",
      topic: "Scheduled case"
    });

    expect(job.source).toBe("scheduled");
    expect(job.scheduleId).toBe("schedule_daily");
    expect(job.scheduleRunId).toBe("run_001");
  });

  it("creates auditable case activity records", () => {
    const activity = createCaseActivity({
      detail: "Script preview was approved before creating the case.",
      jobId: "job_test_activity",
      title: "Preview approved",
      type: "script_preview_approved"
    });

    expect(activity.actor).toBe("AI Producer Agent");
    expect(activity.jobId).toBe("job_test_activity");
    expect(activity.id).toMatch(/^activity_/u);
  });

  it("creates scene review records from generated image assets", () => {
    const reviews = createSceneReviewItems("job_scene_review", [
      {
        asset: {
          driver: "local",
          publicUrl: "http://localhost:4000/uploads/jobs/job_scene_review/images/scene_01.png",
          storagePath: "local://uploads/jobs/job_scene_review/images/scene_01.png"
        },
        costRM: 0.05,
        prompt: "Consistent protagonist enters a library.",
        sceneId: 1
      }
    ]);

    expect(reviews).toHaveLength(1);
    expect(reviews[0]?.status).toBe("generated");
    expect(reviews[0]?.prompt).toContain("library");
  });

  it("syncs character and scene design images into case reference assets", () => {
    const job = createJob({
      characterId: "character_001",
      id: "job_reference_assets",
      topic: "Reference case",
      prompt: "Create a case with visual references.",
      templateType: "urban_legend",
      language: "zh-CN",
      sceneCount: 2,
      costLimitRM: 7.5
    });
    const reviews = createSceneReviewItems(job.id, [
      {
        asset: {
          driver: "local",
          publicUrl: "https://cdn.example.test/jobs/job_reference_assets/images/scene_01.png",
          storagePath: "local://uploads/jobs/job_reference_assets/images/scene_01.png"
        },
        costRM: 0.05,
        prompt: "The same protagonist opens a door.",
        sceneId: 1
      }
    ]);

    const assets = syncCaseReferenceAssets([], [job], reviews, [
      {
        createdAt: "2026-05-30T00:00:00.000Z",
        genre: "multi_genre",
        id: "character_001",
        name: "Mira",
        notes: "",
        outfitLock: "blue jacket",
        referenceImageUrl: "https://cdn.example.test/characters/mira.png",
        status: "approved",
        styleLock: "cinematic",
        updatedAt: "2026-05-30T00:00:00.000Z",
        visualIdentity: "adult fictional protagonist",
        voiceProfile: ""
      }
    ]);

    expect(assets.some((asset) => asset.type === "character_design" && asset.role === "reference_image")).toBe(true);
    expect(assets.some((asset) => asset.type === "first_frame" && asset.role === "first_frame" && asset.sceneId === 1)).toBe(true);
  });

  it("filters activity records to active cases", () => {
    const job = createJob({
      id: "job_active_activity",
      topic: "Active case",
      prompt: "Create an active case.",
      templateType: "rules_horror",
      language: "zh-CN",
      sceneCount: 5,
      costLimitRM: 7.5
    });

    localStorage.setItem(
      "ai-content-factory:case-activities",
      JSON.stringify([
        createCaseActivity({ detail: "Keep this.", jobId: job.id, title: "Kept", type: "case_created" }),
        createCaseActivity({ detail: "Drop this.", jobId: "job_deleted", title: "Dropped", type: "case_created" })
      ])
    );

    const activities = loadCaseActivities([job]);

    expect(activities).toHaveLength(1);
    expect(activities[0]?.jobId).toBe(job.id);
  });
});

function createMemoryStorage(): Storage {
  const store = new Map<string, string>();

  return {
    clear: () => store.clear(),
    getItem: (key) => store.get(key) ?? null,
    key: (index) => Array.from(store.keys())[index] ?? null,
    get length() {
      return store.size;
    },
    removeItem: (key) => store.delete(key),
    setItem: (key, value) => store.set(key, value)
  };
}
