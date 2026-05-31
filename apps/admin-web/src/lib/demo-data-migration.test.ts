import { beforeEach, describe, expect, it, vi } from "vitest";
import { createCharacterProfile, loadCharacterProfiles, loadStoredVideos } from "./admin-data.js";
import { loadJobs } from "./jobs.js";

describe("demo data migration", () => {
  beforeEach(() => {
    vi.stubGlobal("localStorage", createMemoryStorage());
  });

  it("starts with an empty case list instead of demo cases", () => {
    expect(loadJobs()).toEqual([]);
  });

  it("removes legacy demo cases and their stored videos from localStorage", () => {
    localStorage.setItem(
      "ai-content-factory:admin-jobs",
      JSON.stringify([
        { id: "job_demo_001", topic: "demo" },
        { id: "job_real_001", topic: "real", prompt: "real prompt" }
      ])
    );
    localStorage.setItem(
      "ai-content-factory:stored-videos",
      JSON.stringify([
        { id: "video_demo_001", jobId: "job_demo_001" },
        { id: "video_real_001", jobId: "job_real_001" }
      ])
    );

    expect(loadJobs().map((job) => job.id)).toEqual(["job_real_001"]);
    expect(loadStoredVideos().map((video) => video.id)).toEqual(["video_real_001"]);
  });

  it("loads character profiles with safe defaults", () => {
    const character = createCharacterProfile({
      name: "Mira",
      status: "approved",
      visualIdentity: "Adult protagonist with short black hair and a navy coat."
    });

    localStorage.setItem("ai-content-factory:character-profiles", JSON.stringify([character]));

    expect(loadCharacterProfiles()).toMatchObject([
      {
        name: "Mira",
        status: "approved",
        visualIdentity: "Adult protagonist with short black hair and a navy coat."
      }
    ]);
  });

  it("removes legacy genre options from character lock data", () => {
    localStorage.setItem(
      "ai-content-factory:character-profiles",
      JSON.stringify([
        { id: "legacy_001", name: "爱情故事", status: "draft" },
        createCharacterProfile({
          name: "Mira",
          status: "approved",
          visualIdentity: "Adult protagonist with short black hair."
        })
      ])
    );

    expect(loadCharacterProfiles().map((character) => character.name)).toEqual(["Mira"]);
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
