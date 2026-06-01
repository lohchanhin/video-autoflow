import { describe, expect, it } from "vitest";
import type { ProductionAsset } from "@ai-content-factory/shared-types";
import { evaluateProductionAssetReadiness, getExpectedAssetRole } from "./asset-readiness.js";

describe("production asset readiness", () => {
  it("marks approved reference images with URLs as reusable", () => {
    const readiness = evaluateProductionAssetReadiness(createAsset({
      role: "reference_image",
      status: "approved",
      type: "scene_design",
      url: "https://cdn.example.test/scene.png"
    }));

    expect(readiness.canUseAsReference).toBe(true);
    expect(readiness.state).toBe("usable");
    expect(readiness.label).toBe("可复用");
  });

  it("requires generated assets to be reviewed before production use", () => {
    const readiness = evaluateProductionAssetReadiness(createAsset({
      role: "reference_image",
      status: "ready",
      type: "character_design",
      url: "https://cdn.example.test/character.png"
    }));

    expect(readiness.canUseAsReference).toBe(true);
    expect(readiness.state).toBe("needs_review");
    expect(readiness.warnings.join(" ")).toContain("还未批准入库");
  });

  it("blocks assets without URLs from downstream model routing", () => {
    const readiness = evaluateProductionAssetReadiness(createAsset({
      role: "reference_image",
      status: "planned",
      type: "scene_design",
      url: ""
    }));

    expect(readiness.canUseAsReference).toBe(false);
    expect(readiness.state).toBe("needs_generation");
    expect(readiness.blockers.join(" ")).toContain("缺少图片或音频 URL");
  });

  it("flags mismatched roles before Seedance consumes the wrong reference", () => {
    const readiness = evaluateProductionAssetReadiness(createAsset({
      role: "reference_image",
      status: "approved",
      type: "first_frame",
      url: "https://cdn.example.test/frame.png"
    }));

    expect(getExpectedAssetRole("first_frame")).toBe("first_frame");
    expect(readiness.canUseAsReference).toBe(false);
    expect(readiness.state).toBe("needs_routing");
    expect(readiness.blockers.join(" ")).toContain("首帧");
  });

  it("blocks rejected and failed assets from reuse", () => {
    expect(evaluateProductionAssetReadiness(createAsset({ status: "rejected", url: "https://cdn.example.test/rejected.png" })).state).toBe("blocked");
    expect(evaluateProductionAssetReadiness(createAsset({ error: "provider failed", status: "failed", url: "https://cdn.example.test/failed.png" })).blockers).toContain("provider failed");
  });
});

function createAsset(overrides: Partial<ProductionAsset> = {}): ProductionAsset {
  return {
    _id: "asset_readiness",
    costRM: 0,
    createdAt: "2026-06-01T00:00:00.000Z",
    error: "",
    folderName: "场景设计",
    jobId: "asset_library",
    label: "Readiness asset",
    notes: "",
    prompt: "场景设定 prompt",
    provider: "openai",
    role: "reference_image",
    sceneId: null,
    scope: "case",
    status: "approved",
    storagePath: "",
    tags: [],
    type: "scene_design",
    updatedAt: "2026-06-01T00:00:00.000Z",
    url: "https://cdn.example.test/asset.png",
    ...overrides
  };
}
