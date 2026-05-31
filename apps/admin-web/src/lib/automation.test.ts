import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  calculateNextRunAt,
  createCasePublishTargets,
  createPublishingTarget,
  createScheduleRun,
  loadAiToolEndpoints,
  loadProductionSchedules,
  saveProductionSchedules
} from "./admin-data.js";

describe("automation and publishing models", () => {
  beforeEach(() => {
    vi.stubGlobal("localStorage", createMemoryStorage());
  });

  it("calculates the next daily schedule run", () => {
    const now = new Date("2026-05-19T08:30:00.000+08:00");
    const nextRunAt = calculateNextRunAt({ daysOfWeek: [1, 2, 3, 4, 5, 6, 7], startTime: "09:00" }, now);

    expect(new Date(nextRunAt).getHours()).toBe(9);
    expect(new Date(nextRunAt).getDate()).toBe(19);
  });

  it("moves next run to tomorrow when today's start time has passed", () => {
    const now = new Date("2026-05-19T21:00:00.000+08:00");
    const nextRunAt = calculateNextRunAt({ daysOfWeek: [1, 2, 3, 4, 5, 6, 7], startTime: "09:00" }, now);

    expect(new Date(nextRunAt).getDate()).toBe(20);
  });

  it("normalizes saved schedules without seeding fake publishing targets", () => {
    const schedules = loadProductionSchedules();

    expect(schedules[0]?.timezone).toBe("Asia/Kuala_Lumpur");
    expect(schedules[0]?.approvalGate).toBe("mp4_review");
    expect(schedules[0]?.targetIds).toEqual([]);
  });

  it("creates independent private publish targets per case", () => {
    const targets = createCasePublishTargets("job_publish_matrix", ["target_a", "target_b"]);

    expect(targets).toHaveLength(2);
    expect(targets.every((target) => target.privacyStatus === "private")).toBe(true);
    expect(targets.every((target) => target.status === "pending_review")).toBe(true);
  });

  it("stores schedule run audit rows", () => {
    const run = createScheduleRun({
      createdCaseIds: ["job_1", "job_2"],
      plannedCaseCount: 2,
      scheduleId: "schedule_daily_horror_shorts",
      status: "completed"
    });

    expect(run.createdCaseIds).toEqual(["job_1", "job_2"]);
    expect(run.error).toBeNull();
  });

  it("keeps publishing target privacy locked to private", () => {
    const target = createPublishingTarget({
      accountId: "account_001",
      channelName: "Night Rules Horror",
      youtubeChannelId: "UC_private"
    });

    expect(target.defaultPrivacy).toBe("private");
  });

  it("persists schedules through local storage", () => {
    const schedules = loadProductionSchedules();
    saveProductionSchedules([{ ...schedules[0]!, enabled: false }]);

    expect(loadProductionSchedules()[0]?.enabled).toBe(false);
  });

  it("uses OpenAI TTS as the default voiceover endpoint", () => {
    const ttsEndpoint = loadAiToolEndpoints().find((endpoint) => endpoint.id === "tool_tts");

    expect(ttsEndpoint?.provider).toContain("OpenAI TTS");
    expect(ttsEndpoint?.endpoint).toBe("https://api.openai.com/v1/audio/speech");
    expect(ttsEndpoint?.envKeys).toContain("OPENAI_TTS_MODEL");
    expect(ttsEndpoint?.status).toBe("needs_setup");
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
