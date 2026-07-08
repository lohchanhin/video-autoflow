import request from "supertest";
import { describe, expect, it, vi } from "vitest";
import type { StoryWorld } from "@ai-content-factory/shared-types";
import type { StoryWorldCreateInput, StoryWorldsRepository } from "@ai-content-factory/database";
import { createApp } from "../src/app.js";

describe("story worlds API", () => {
  it("creates, updates, lists, and deletes reusable story worlds", async () => {
    const repository = createStoryWorldsRepositoryMock();
    const app = createApp({ storyWorldsRepository: repository });

    const createResponse = await request(app)
      .post("/story-worlds")
      .send({
        defaultSceneAssetIds: ["asset_rainbow_forest"],
        description: "Reusable world for a flexible story series.",
        name: "Rainbow Forest",
        recurringCharacterAssetIds: ["asset_rabbit"],
        status: "active",
        visualStyle: "soft storybook lighting"
      })
      .expect(201);

    const worldId = createResponse.body.storyWorld._id;

    await request(app)
      .patch(`/story-worlds/${worldId}`)
      .send({ relationshipMap: "Rabbit Mimi studies with forest classmates." })
      .expect(200);

    const listResponse = await request(app)
      .get("/story-worlds")
      .expect(200);

    await request(app)
      .delete(`/story-worlds/${worldId}`)
      .expect(204);

    expect(repository.create).toHaveBeenCalledWith(expect.objectContaining({
      defaultSceneAssetIds: ["asset_rainbow_forest"],
      name: "Rainbow Forest",
      recurringCharacterAssetIds: ["asset_rabbit"]
    }));
    expect(repository.patch).toHaveBeenCalledWith(worldId, expect.objectContaining({
      relationshipMap: "Rabbit Mimi studies with forest classmates."
    }));
    expect(listResponse.body.storyWorlds).toEqual(expect.any(Array));
    expect(repository.delete).toHaveBeenCalledWith(worldId);
  });
});

function createStoryWorldsRepositoryMock(): StoryWorldsRepository {
  const storyWorlds: StoryWorld[] = [];

  return {
    create: vi.fn(async (input: StoryWorldCreateInput) => {
      const storyWorld = createStoryWorld(input);
      storyWorlds.push(storyWorld);
      return storyWorld;
    }),
    delete: vi.fn(async (id: string) => {
      const index = storyWorlds.findIndex((storyWorld) => storyWorld._id === id);
      if (index === -1) return false;
      storyWorlds.splice(index, 1);
      return true;
    }),
    ensureIndexes: vi.fn(),
    findById: vi.fn(async (id: string) => storyWorlds.find((storyWorld) => storyWorld._id === id) ?? null),
    list: vi.fn(async () => storyWorlds),
    patch: vi.fn(async (id: string, patch: Partial<StoryWorld>) => {
      const storyWorld = storyWorlds.find((candidate) => candidate._id === id);
      if (!storyWorld) return null;
      Object.assign(storyWorld, patch, { updatedAt: "2026-06-01T00:01:00.000Z" });
      return storyWorld;
    })
  };
}

function createStoryWorld(input: StoryWorldCreateInput): StoryWorld {
  const now = "2026-06-01T00:00:00.000Z";

  return {
    _id: input.id ?? "story_world_001",
    createdAt: now,
    defaultSceneAssetIds: input.defaultSceneAssetIds ?? [],
    description: input.description ?? "",
    name: input.name ?? "Untitled Story World",
    recurringCharacterAssetIds: input.recurringCharacterAssetIds ?? [],
    relationshipMap: input.relationshipMap ?? "",
    safetyRules: input.safetyRules ?? "",
    seriesIds: input.seriesIds ?? [],
    status: input.status ?? "draft",
    updatedAt: now,
    visualStyle: input.visualStyle ?? ""
  };
}
