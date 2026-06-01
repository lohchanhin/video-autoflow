import { beforeEach, describe, expect, it, vi } from "vitest";
import { defaultProducerAgent } from "./agents.js";
import {
  createPublishingTarget,
  loadAiToolEndpoints,
  loadProviderKeys,
  loadProductionSchedules,
  loadToolProviderSettings,
  type PublishingTarget
} from "./admin-data.js";
import type { AdminJob } from "./jobs.js";
import { evaluateScheduleRunGuard } from "./schedule-guards.js";

describe("schedule run guards", () => {
  beforeEach(() => {
    vi.stubGlobal("localStorage", createMemoryStorage());
  });

  it("allows queued scheduled production when no YouTube target is selected", () => {
    const schedule = { ...loadProductionSchedules()[0]!, enabled: true, targetIds: [] };
    const guard = evaluateScheduleRunGuard({
      endpoints: loadAiToolEndpoints(),
      jobs: [],
      producerAgent: defaultProducerAgent,
      publishingTargets: [],
      schedule,
      settings: loadToolProviderSettings()
    });

    expect(guard.canRun).toBe(true);
    expect(guard.plannedCaseCount).toBeGreaterThan(0);
    expect(guard.warnings[0]).toContain("MP4/QC");
    expect(guard.warnings.some((warning) => warning.includes("仅建立 Case"))).toBe(true);
  });

  it("blocks when selected publishing targets are all disabled", () => {
    const target = { ...createPublishingTarget({ accountId: "account_1", channelName: "Target", youtubeChannelId: "UC_target" }), enabled: false } satisfies PublishingTarget;
    const schedule = { ...loadProductionSchedules()[0]!, enabled: true, targetIds: [target.id] };
    const guard = evaluateScheduleRunGuard({
      endpoints: loadAiToolEndpoints(),
      jobs: [],
      producerAgent: defaultProducerAgent,
      publishingTargets: [target],
      schedule,
      settings: loadToolProviderSettings()
    });

    expect(guard.canRun).toBe(false);
    expect(guard.blockers).toContain("已选择的 YouTube 发布目标都未启用。");
  });

  it("blocks automatic runs when a required tool is manual-only", () => {
    const schedule = { ...loadProductionSchedules()[0]!, enabled: true, executionMode: "autopilot_to_mp4" as const, targetIds: [] };
    const settings = loadToolProviderSettings().map((setting) =>
      setting.toolType === "llm" ? { ...setting, allowAutopilot: false } : setting
    );
    const guard = evaluateScheduleRunGuard({
      endpoints: loadAiToolEndpoints(),
      jobs: [],
      producerAgent: defaultProducerAgent,
      publishingTargets: [],
      schedule,
      settings
    });

    expect(guard.canRun).toBe(false);
    expect(guard.blockers.some((blocker) => blocker.includes("只允许手动调用"))).toBe(true);
  });

  it("blocks automatic runs when a required provider key is missing", () => {
    const schedule = { ...loadProductionSchedules()[0]!, enabled: true, executionMode: "autopilot_to_mp4" as const, targetIds: [] };
    const guard = evaluateScheduleRunGuard({
      endpoints: loadAiToolEndpoints(),
      jobs: [],
      producerAgent: defaultProducerAgent,
      providerKeys: loadProviderKeys(),
      publishingTargets: [],
      schedule,
      settings: loadToolProviderSettings()
    });

    expect(guard.canRun).toBe(false);
    expect(guard.blockers.some((blocker) => blocker.includes("OPENAI_API_KEY"))).toBe(true);
  });

  it("blocks when daily quota or budget is exhausted", () => {
    const schedule = { ...loadProductionSchedules()[0]!, budgetLimitRM: 7.5, enabled: true, maxVideosPerDay: 1, targetIds: [] };
    const jobs = [
      {
        actualCostRM: 0,
        costLimitRM: 7.5,
        createdAt: new Date().toISOString(),
        scheduleId: schedule.id,
        source: "scheduled"
      }
    ] satisfies Pick<AdminJob, "actualCostRM" | "costLimitRM" | "createdAt" | "scheduleId" | "source">[];
    const guard = evaluateScheduleRunGuard({
      endpoints: loadAiToolEndpoints(),
      jobs,
      producerAgent: defaultProducerAgent,
      publishingTargets: [],
      schedule,
      settings: loadToolProviderSettings()
    });

    expect(guard.canRun).toBe(false);
    expect(guard.blockers).toContain("今日排程产量已达到上限。");
    expect(guard.blockers).toContain("今日排程预算已不足。");
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
