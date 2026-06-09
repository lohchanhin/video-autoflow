import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  createLocalDataSnapshot,
  getLocalDataStats,
  importLocalDataSnapshot,
  isLocalDataMigrationMessage,
  isLocalDataSnapshot,
  listFactoryLocalData
} from "./local-data-portability.js";

describe("local data portability", () => {
  beforeEach(() => {
    vi.stubGlobal("localStorage", createMemoryStorage());
  });

  it("exports only AI Content Factory localStorage keys", () => {
    localStorage.setItem("ai-content-factory:admin-jobs", JSON.stringify([{ id: "job_001" }]));
    localStorage.setItem("unrelated", "ignore");

    const entries = listFactoryLocalData();

    expect(entries).toEqual([
      {
        key: "ai-content-factory:admin-jobs",
        value: JSON.stringify([{ id: "job_001" }])
      }
    ]);
  });

  it("creates a valid snapshot with source origin metadata", () => {
    localStorage.setItem("ai-content-factory:budget-settings", JSON.stringify({ defaultCaseBudgetRM: 30 }));

    const snapshot = createLocalDataSnapshot("http://137.184.100.54:5173");

    expect(isLocalDataSnapshot(snapshot)).toBe(true);
    expect(snapshot.sourceOrigin).toBe("http://137.184.100.54:5173");
    expect(snapshot.entries).toHaveLength(1);
  });

  it("imports snapshots and can preserve existing keys when overwrite is disabled", () => {
    localStorage.setItem("ai-content-factory:budget-settings", JSON.stringify({ defaultCaseBudgetRM: 7.5 }));
    const snapshot = {
      app: "ai-content-factory" as const,
      entries: [
        { key: "ai-content-factory:budget-settings", value: JSON.stringify({ defaultCaseBudgetRM: 50 }) },
        { key: "ai-content-factory:admin-jobs", value: JSON.stringify([{ id: "job_002" }]) }
      ],
      exportedAt: new Date().toISOString(),
      schemaVersion: 1 as const,
      sourceOrigin: "http://137.184.100.54:5173"
    };

    const result = importLocalDataSnapshot(snapshot, { overwrite: false });

    expect(result).toEqual({ imported: 1, skipped: 1 });
    expect(JSON.parse(localStorage.getItem("ai-content-factory:budget-settings") ?? "{}")).toEqual({ defaultCaseBudgetRM: 7.5 });
    expect(JSON.parse(localStorage.getItem("ai-content-factory:admin-jobs") ?? "[]")).toEqual([{ id: "job_002" }]);
  });

  it("detects migration postMessage payloads", () => {
    const snapshot = createLocalDataSnapshot("http://137.184.100.54:5173");

    expect(isLocalDataMigrationMessage({ snapshot, type: "ai-content-factory:local-data-migration" })).toBe(true);
    expect(isLocalDataMigrationMessage({ snapshot, type: "other" })).toBe(false);
  });

  it("reports local data stats", () => {
    localStorage.setItem("ai-content-factory:admin-jobs", "12345");
    localStorage.setItem("ai-content-factory:stored-videos", "678");

    expect(getLocalDataStats()).toMatchObject({ count: 2 });
    expect(getLocalDataStats().bytes).toBeGreaterThan(8);
  });
});

function createMemoryStorage(): Storage {
  const store = new Map<string, string>();

  return {
    get length() {
      return store.size;
    },
    clear() {
      store.clear();
    },
    getItem(key: string) {
      return store.get(key) ?? null;
    },
    key(index: number) {
      return Array.from(store.keys())[index] ?? null;
    },
    removeItem(key: string) {
      store.delete(key);
    },
    setItem(key: string, value: string) {
      store.set(key, value);
    }
  };
}
