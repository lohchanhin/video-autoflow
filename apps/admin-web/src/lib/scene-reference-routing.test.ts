import { describe, expect, it } from "vitest";
import type { GenerationReferenceAsset, ProductionAsset } from "@ai-content-factory/shared-types";
import {
  isReferenceCompositeFallbackText,
  isSceneReviewBlockingForProduction,
  selectSceneGenerationReferences,
  selectSceneProductionAssetsForGeneration
} from "./scene-reference-routing.js";

describe("scene reference routing", () => {
  it("routes only matching fruit drama characters into the scene", () => {
    const assets = [
      createAsset({ _id: "asset_banana", label: "香蕉总裁", type: "character_design" }),
      createAsset({ _id: "asset_strawberry", label: "草莓员工", type: "character_design" }),
      createAsset({ _id: "asset_orange", label: "橘子总裁", type: "character_design" }),
      createAsset({ _id: "asset_office", label: "总裁办公室", type: "scene_design" }),
      createAsset({ _id: "asset_forest", label: "彩虹森林", type: "scene_design" })
    ];

    const selected = selectSceneProductionAssetsForGeneration(assets, {
      imagePrompt: "香蕉总裁在总裁办公室质问草莓员工，玻璃幕墙外是都市夜景。",
      sceneId: 1
    });

    expect(selected.map((asset) => asset.label).sort()).toEqual(["总裁办公室", "草莓员工", "香蕉总裁"].sort());
  });

  it("does not carry the full series asset pool into unrelated scenes", () => {
    const references = [
      createReference({ label: "香蕉总裁", type: "character_design" }),
      createReference({ label: "水蜜桃秘书", type: "character_design" }),
      createReference({ label: "樱桃前任", type: "character_design" }),
      createReference({ label: "高级甜品店", type: "scene_design" })
    ];

    const selected = selectSceneGenerationReferences(references, {
      imagePrompt: "水蜜桃秘书独自坐在高级甜品店角落，看着手机里的离职通知。",
      sceneId: 2
    });

    expect(selected.map((reference) => reference.label)).toEqual(["水蜜桃秘书", "高级甜品店"]);
  });

  it("allows a single safe fallback reference when the case has only one character and one set", () => {
    const assets = [
      createAsset({ _id: "asset_rabbit", label: "兔子米米", type: "character_design" }),
      createAsset({ _id: "asset_school", label: "森林小学", type: "scene_design" })
    ];

    const selected = selectSceneProductionAssetsForGeneration(assets, {
      imagePrompt: "主角低头承认错误。",
      sceneId: 3
    });

    expect(selected.map((asset) => asset.label)).toEqual(["兔子米米", "森林小学"]);
  });

  it("does not route first or last frame rows as reusable scene references", () => {
    const assets = [
      createAsset({ _id: "asset_banana", label: "香蕉总裁", type: "character_design" }),
      createAsset({ _id: "asset_office", label: "总裁办公室", type: "scene_design" }),
      createAsset({ _id: "asset_first", label: "总裁办公室首帧", role: "first_frame", sceneId: 1, type: "first_frame" }),
      createAsset({ _id: "asset_last", label: "总裁办公室尾帧", role: "last_frame", sceneId: 1, type: "last_frame" })
    ];

    const selected = selectSceneProductionAssetsForGeneration(assets, {
      imagePrompt: "香蕉总裁在总裁办公室低声质问。",
      sceneId: 1
    });

    expect(selected.map((asset) => asset.type)).toEqual(["character_design", "scene_design"]);
  });

  it("blocks local reference composite fallback from downstream production", () => {
    expect(isReferenceCompositeFallbackText("OpenAI image generation timed out; scene image was composed from approved reference assets.")).toBe(true);
    expect(isSceneReviewBlockingForProduction({
      notes: "",
      qcIssues: ["OpenAI image generation timed out; scene image was composed from approved reference assets."],
      qcStatus: "warning",
      qcSummary: "",
      status: "generated"
    })).toBe(true);
  });
});

function createAsset(overrides: Partial<ProductionAsset>): ProductionAsset {
  return {
    _id: "asset_default",
    costRM: 0,
    createdAt: "2026-06-01T00:00:00.000Z",
    error: "",
    folderName: "角色设计",
    jobId: "",
    label: "Asset",
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
    url: `https://vertex-workflow.com/uploads/assets/${overrides._id ?? "asset_default"}.png`,
    ...overrides
  };
}

function createReference(overrides: Partial<GenerationReferenceAsset>): GenerationReferenceAsset {
  return {
    label: "Reference",
    role: "reference_image",
    type: "character_design",
    url: `https://vertex-workflow.com/uploads/assets/${overrides.label ?? "reference"}.png`,
    ...overrides
  };
}
