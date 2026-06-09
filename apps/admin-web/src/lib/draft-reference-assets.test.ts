import type { ProductionAsset } from "@ai-content-factory/shared-types";
import { describe, expect, it, vi, afterEach } from "vitest";
import { isReusableDraftReferenceAsset, isSelectableDraftReferenceAsset, shouldHideFromNewCaseReferencePicker } from "./draft-reference-assets.js";

describe("draft reference asset picker rules", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("keeps reusable asset-library references selectable", () => {
    vi.stubGlobal("window", {
      location: {
        hostname: "vertex-workflow.com",
        origin: "https://vertex-workflow.com",
        protocol: "https:"
      }
    });

    const asset = createAsset({
      jobId: "asset_library",
      status: "approved",
      storagePath: "local://uploads/jobs/asset_library/character/references/character_design.png"
    });

    expect(isSelectableDraftReferenceAsset(asset)).toBe(true);
    expect(isReusableDraftReferenceAsset(asset)).toBe(true);
    expect(shouldHideFromNewCaseReferencePicker(asset)).toBe(false);
  });

  it("hides case planning placeholders and missing-preview assets from New Case", () => {
    expect(shouldHideFromNewCaseReferencePicker(createAsset({
      jobId: "job_001",
      status: "planned",
      storagePath: "",
      url: ""
    }))).toBe(true);

    expect(shouldHideFromNewCaseReferencePicker(createAsset({
      jobId: "job_002",
      status: "approved",
      storagePath: "",
      url: ""
    }))).toBe(true);
  });

  it("hides visual assets whose media value is not an image", () => {
    expect(isSelectableDraftReferenceAsset(createAsset({
      status: "approved",
      storagePath: "local://uploads/jobs/asset_library/reference.txt",
      url: ""
    }))).toBe(false);

    expect(shouldHideFromNewCaseReferencePicker(createAsset({
      status: "approved",
      storagePath: "local://uploads/jobs/asset_library/reference.txt",
      url: ""
    }))).toBe(true);
  });
});

function createAsset(overrides: Partial<ProductionAsset> = {}): ProductionAsset {
  return {
    _id: "asset_001",
    costRM: 0,
    createdAt: "2026-06-01T00:00:00.000Z",
    error: "",
    folderName: "角色设计",
    jobId: "asset_library",
    label: "测试角色",
    notes: "",
    prompt: "",
    provider: "openai",
    role: "reference_image",
    sceneId: null,
    scope: "case",
    status: "approved",
    storagePath: "local://uploads/jobs/asset_library/asset_001/references/character_design.png",
    tags: [],
    type: "character_design",
    updatedAt: "2026-06-01T00:00:00.000Z",
    url: "",
    ...overrides
  };
}
