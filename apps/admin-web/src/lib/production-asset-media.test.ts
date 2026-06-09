import type { ProductionAsset } from "@ai-content-factory/shared-types";
import { describe, expect, it, vi, afterEach } from "vitest";
import { resolveProductionAssetMediaUrl, resolveProductionAssetPreviewUrl } from "./production-asset-media.js";

describe("production asset media helpers", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("uses visual production assets as previews even when the upload URL has no image extension", () => {
    vi.stubGlobal("window", {
      location: {
        hostname: "vertex-workflow.com",
        origin: "https://vertex-workflow.com",
        protocol: "https:"
      }
    });

    const asset = createAsset({
      storagePath: "local://uploads/assets/asset_123",
      type: "character_design"
    });

    expect(resolveProductionAssetMediaUrl(asset)).toBe("https://vertex-workflow.com/uploads/assets/asset_123");
    expect(resolveProductionAssetPreviewUrl(asset)).toBe("https://vertex-workflow.com/uploads/assets/asset_123");
  });

  it("does not treat non-visual production assets without an image extension as image previews", () => {
    const asset = createAsset({
      storagePath: "local://uploads/assets/music_123",
      type: "bgm_reference"
    });

    expect(resolveProductionAssetPreviewUrl(asset)).toBe("");
  });
});

function createAsset(overrides: Partial<ProductionAsset> = {}): ProductionAsset {
  return {
    _id: "asset_001",
    costRM: 0,
    createdAt: "2026-06-01T00:00:00.000Z",
    error: "",
    folderName: "角色设计",
    jobId: "",
    label: "测试资产",
    notes: "",
    prompt: "",
    provider: "openai",
    role: "reference_image",
    sceneId: null,
    scope: "case",
    status: "approved",
    storagePath: "",
    tags: [],
    type: "character_design",
    updatedAt: "2026-06-01T00:00:00.000Z",
    url: "",
    ...overrides
  };
}
