import { describe, expect, it } from "vitest";
import type { ProductionAsset } from "@ai-content-factory/shared-types";
import { buildProductionAssetVersionDraft } from "./production-assets.js";

describe("production asset version drafts", () => {
  it("forks a reusable asset without carrying over generated image output", () => {
    const source = createAsset();
    const draft = buildProductionAssetVersionDraft(source, new Date("2026-06-01T10:30:00+08:00"));

    expect(draft).toMatchObject({
      costRM: 0,
      error: "",
      folderName: "角色设计",
      jobId: "asset_library",
      label: "圣骑士 - new version 20260601-1030",
      prompt: source.prompt,
      role: "reference_image",
      status: "planned",
      storagePath: "",
      type: "character_design",
      url: ""
    });
    expect(draft.notes).toContain(source._id);
    expect(draft.tags).toContain("version");
  });
});

function createAsset(): ProductionAsset {
  return {
    _id: "asset_paladin",
    costRM: 1,
    createdAt: "2026-06-01T00:00:00.000Z",
    error: "",
    folderName: "角色设计",
    jobId: "asset_library",
    label: "圣骑士",
    notes: "",
    prompt: "silver paladin three-view character sheet",
    provider: "openai",
    role: "reference_image",
    sceneId: null,
    scope: "case",
    status: "approved",
    storagePath: "local://uploads/assets/paladin.png",
    tags: ["paladin"],
    type: "character_design",
    updatedAt: "2026-06-01T00:00:00.000Z",
    url: "http://localhost:4000/uploads/assets/paladin.png"
  };
}
