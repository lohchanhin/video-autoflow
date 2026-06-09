import request from "supertest";
import { describe, expect, it, vi } from "vitest";
import type { AppStateEntry } from "@ai-content-factory/shared-types";
import { createApp } from "../src/app.js";
import type { AppStateRepository } from "@ai-content-factory/database";

describe("app state API", () => {
  it("stores browser business state in Mongo-backed app state", async () => {
    const repository = createMemoryAppStateRepository();
    const app = createApp({ appStateRepository: repository });

    await request(app)
      .post("/app-state/snapshot")
      .send({
        entries: [
          { key: "ai-content-factory:admin-jobs", value: JSON.stringify([{ id: "job_001" }]) },
          { key: "ai-content-factory:budget-settings", value: JSON.stringify({ defaultCaseBudgetRM: 30 }) }
        ]
      })
      .expect(200);

    await request(app)
      .put(`/app-state/${encodeURIComponent("ai-content-factory:budget-settings")}`)
      .send({ value: JSON.stringify({ defaultCaseBudgetRM: 80 }) })
      .expect(200);

    const response = await request(app).get("/app-state?prefix=ai-content-factory%3A").expect(200);

    expect(response.body.source).toBe("mongodb");
    expect(response.body.entries.map((entry: AppStateEntry) => entry.key)).toEqual(["ai-content-factory:admin-jobs", "ai-content-factory:budget-settings"]);
    expect(JSON.parse(response.body.entries.find((entry: AppStateEntry) => entry.key === "ai-content-factory:budget-settings").value)).toEqual({
      defaultCaseBudgetRM: 80
    });
  });

  it("rejects unrelated localStorage keys", async () => {
    const app = createApp({ appStateRepository: createMemoryAppStateRepository() });

    await request(app)
      .put(`/app-state/${encodeURIComponent("other-app:key")}`)
      .send({ value: "bad" })
      .expect(400);
  });
});

function createMemoryAppStateRepository(): AppStateRepository {
  const entries = new Map<string, AppStateEntry>();

  return {
    ensureIndexes: vi.fn().mockResolvedValue(undefined),
    list: vi.fn(async (prefix?: string) =>
      [...entries.values()]
        .filter((entry) => !prefix || entry.key.startsWith(prefix))
        .sort((left, right) => left.key.localeCompare(right.key))
    ),
    upsert: vi.fn(async (key: string, value: string) => {
      const entry: AppStateEntry = {
        key,
        updatedAt: new Date().toISOString(),
        value
      };
      entries.set(key, entry);
      return entry;
    }),
    upsertMany: vi.fn(async (items: Array<{ key: string; value: string }>) => {
      const saved: AppStateEntry[] = [];

      for (const item of items) {
        const entry: AppStateEntry = {
          key: item.key,
          updatedAt: new Date().toISOString(),
          value: item.value
        };
        entries.set(item.key, entry);
        saved.push(entry);
      }

      return saved;
    })
  };
}
