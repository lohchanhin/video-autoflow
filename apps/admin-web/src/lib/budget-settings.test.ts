import { beforeEach, describe, expect, it, vi } from "vitest";
import { loadBudgetSettings, loadProductionSchedules, saveBudgetSettings } from "./admin-data.js";

describe("global budget settings", () => {
  beforeEach(() => {
    vi.stubGlobal("localStorage", createMemoryStorage());
  });

  it("loads default budget controls for cases and automation", () => {
    const settings = loadBudgetSettings();
    const schedule = loadProductionSchedules()[0]!;

    expect(settings.defaultCaseBudgetRM).toBe(7.5);
    expect(settings.dailyBudgetRM).toBe(80);
    expect(settings.monthlyBudgetRM).toBe(2500);
    expect(settings.maxCasesPerRun).toBe(5);
    expect(settings.maxVideosPerDay).toBe(10);
    expect(settings.stopWhenBudgetExceeded).toBe(true);
    expect(schedule.budgetLimitRM).toBe(settings.dailyBudgetRM);
    expect(schedule.maxCasesPerRun).toBe(settings.maxCasesPerRun);
    expect(schedule.maxVideosPerDay).toBe(settings.maxVideosPerDay);
  });

  it("persists and normalizes saved global budget settings", () => {
    saveBudgetSettings({
      dailyBudgetRM: 120,
      defaultCaseBudgetRM: 12.5,
      maxCasesPerRun: 8,
      maxVideosPerDay: 20,
      monthlyBudgetRM: 3600,
      stopWhenBudgetExceeded: false,
      updatedAt: "2026-06-07T00:00:00.000Z"
    });

    const settings = loadBudgetSettings();

    expect(settings).toMatchObject({
      dailyBudgetRM: 120,
      defaultCaseBudgetRM: 12.5,
      maxCasesPerRun: 8,
      maxVideosPerDay: 20,
      monthlyBudgetRM: 3600,
      stopWhenBudgetExceeded: false
    });
  });

  it("clamps invalid budgets to safe positive values", () => {
    localStorage.setItem(
      "ai-content-factory:budget-settings",
      JSON.stringify({
        dailyBudgetRM: -1,
        defaultCaseBudgetRM: 0,
        maxCasesPerRun: 0,
        maxVideosPerDay: 0,
        monthlyBudgetRM: 0,
        stopWhenBudgetExceeded: true,
        updatedAt: ""
      })
    );

    const settings = loadBudgetSettings();

    expect(settings.defaultCaseBudgetRM).toBe(0.1);
    expect(settings.dailyBudgetRM).toBe(1);
    expect(settings.monthlyBudgetRM).toBe(1);
    expect(settings.maxCasesPerRun).toBe(1);
    expect(settings.maxVideosPerDay).toBe(1);
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
