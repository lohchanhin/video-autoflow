import { beforeEach, describe, expect, it, vi } from "vitest";
import { loadActiveScheduleRunLocks, tryAcquireScheduleRunLock } from "./schedule-run-locks.js";

describe("schedule run locks", () => {
  beforeEach(() => {
    vi.stubGlobal("localStorage", createMemoryStorage());
  });

  it("prevents the same scheduled run from being acquired twice", () => {
    const now = new Date("2026-06-01T09:00:00.000+08:00");
    const input = {
      now,
      runAt: "2026-06-01T09:00:00.000+08:00",
      scheduleId: "schedule_daily"
    };

    expect(tryAcquireScheduleRunLock(input)).toBe(true);
    expect(tryAcquireScheduleRunLock(input)).toBe(false);
    expect(loadActiveScheduleRunLocks(now)).toHaveLength(1);
  });

  it("allows a later nextRunAt for the same schedule", () => {
    const now = new Date("2026-06-01T09:00:00.000+08:00");

    expect(tryAcquireScheduleRunLock({ now, runAt: "2026-06-01T09:00:00.000+08:00", scheduleId: "schedule_daily" })).toBe(true);
    expect(tryAcquireScheduleRunLock({ now, runAt: "2026-06-02T09:00:00.000+08:00", scheduleId: "schedule_daily" })).toBe(true);
  });

  it("expires stale locks", () => {
    const firstRun = new Date("2026-06-01T09:00:00.000+08:00");
    const later = new Date("2026-06-01T09:11:00.000+08:00");
    const input = {
      runAt: "2026-06-01T09:00:00.000+08:00",
      scheduleId: "schedule_daily",
      ttlMs: 10 * 60 * 1000
    };

    expect(tryAcquireScheduleRunLock({ ...input, now: firstRun })).toBe(true);
    expect(tryAcquireScheduleRunLock({ ...input, now: later })).toBe(true);
    expect(loadActiveScheduleRunLocks(later)).toHaveLength(1);
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
