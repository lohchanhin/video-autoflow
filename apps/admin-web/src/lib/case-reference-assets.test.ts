import { describe, expect, it } from "vitest";
import type { ProductionAsset } from "@ai-content-factory/shared-types";
import {
  buildAssetContextBrief,
  buildReferenceAssetPromptContext,
  isBackgroundDesignAsset,
  isCharacterDesignAsset,
  isReadyReferenceAsset,
  productionAssetToGenerationReference
} from "./case-reference-assets.js";

describe("case reference asset routing", () => {
  it("only treats approved or ready assets with URLs as generation references", () => {
    expect(isReadyReferenceAsset(createAsset({ status: "approved", url: "https://cdn.test/paladin.png" }))).toBe(true);
    expect(isReadyReferenceAsset(createAsset({ status: "ready", url: "https://cdn.test/paladin.png" }))).toBe(true);
    expect(isReadyReferenceAsset(createAsset({ status: "planned", url: "https://cdn.test/paladin.png" }))).toBe(false);
    expect(isReadyReferenceAsset(createAsset({ status: "approved", url: "" }))).toBe(false);
  });

  it("classifies character and reusable background assets for case creation", () => {
    expect(isCharacterDesignAsset(createAsset({ type: "character_design" }))).toBe(true);
    expect(isBackgroundDesignAsset(createAsset({ type: "scene_design" }))).toBe(true);
    expect(isBackgroundDesignAsset(createAsset({ type: "style_reference" }))).toBe(true);
    expect(isBackgroundDesignAsset(createAsset({ type: "first_frame" }))).toBe(true);
    expect(isBackgroundDesignAsset(createAsset({ type: "character_design" }))).toBe(false);
  });

  it("adds selected visual assets to the case brief without leaking prompt-engineering instructions", () => {
    const character = createAsset({
      label: "Silver paladin",
      prompt: [
        "holy paladin, silver armor, blue cape, adult original character",
        "用户描述是最高优先级：不要改变用户指定的题材。",
        "输出规格：角色三视图设定稿。",
        "禁止：文字、标签、UI。"
      ].join("\n"),
      type: "character_design"
    });
    const scene = createAsset({
      label: "Cathedral hall",
      notes: "Grand cathedral environment sheet, stained glass, central round table, consistent window layout.",
      type: "scene_design"
    });

    const brief = buildAssetContextBrief(character, scene);

    expect(brief).toContain("Silver paladin");
    expect(brief).toContain("holy paladin, silver armor");
    expect(brief).toContain("Cathedral hall");
    expect(brief).toContain("Grand cathedral environment sheet");
    expect(brief).not.toContain("输出规格");
    expect(brief).not.toContain("禁止");
  });

  it("converts approved production assets into generation references", () => {
    const asset = createAsset({
      label: "Cathedral sheet",
      prompt: [
        "Create one production-ready environment bible sheet.",
        "USER DESIGN BRIEF: grand cathedral, central round table, stained glass, same altar and chairs in every angle.",
        "Frame specification: one image containing 6 views.",
        "Do not create UI or readable text."
      ].join("\n"),
      role: "reference_image",
      type: "scene_design",
      url: "https://cdn.test/cathedral.png"
    });

    expect(productionAssetToGenerationReference(asset)).toMatchObject({
      label: "Cathedral sheet",
      prompt: "grand cathedral, central round table, stained glass, same altar and chairs in every angle.",
      role: "reference_image",
      type: "scene_design",
      url: "https://cdn.test/cathedral.png"
    });

    const reference = productionAssetToGenerationReference(asset);
    expect(reference?.notes).toContain("Environment bible reference");
    expect(reference?.notes).toContain("Scene consistency contract");
    expect(reference?.notes).not.toContain("Frame specification");
    expect(productionAssetToGenerationReference(createAsset({ status: "rejected" }))).toBeNull();
  });

  it("builds Seedance-safe context for scene design assets", () => {
    const context = buildReferenceAssetPromptContext(createAsset({
      label: "Convenience store environment bible",
      prompt: [
        "USER DESIGN BRIEF: rainy night convenience store, fixed shelves, cashier counter, old CCTV monitor, coffee machine.",
        "Frame specification: one clean environment bible sheet.",
        "Do not create readable text."
      ].join("\n"),
      type: "scene_design"
    }));

    expect(context).toContain("Environment bible reference");
    expect(context).toContain("rainy night convenience store");
    expect(context).toContain("Scene consistency contract");
    expect(context).not.toContain("Frame specification");
    expect(context).not.toContain("Do not create");
  });
});

function createAsset(overrides: Partial<ProductionAsset> = {}): ProductionAsset {
  return {
    _id: "asset_test",
    costRM: 0,
    createdAt: "2026-06-01T00:00:00.000Z",
    error: "",
    folderName: "Design assets",
    jobId: "asset_library",
    label: "Test asset",
    notes: "",
    prompt: "visual reference",
    provider: "openai",
    role: "reference_image",
    sceneId: null,
    scope: "case",
    status: "approved",
    storagePath: "local://uploads/assets/test.png",
    tags: [],
    type: "character_design",
    updatedAt: "2026-06-01T00:00:00.000Z",
    url: "https://cdn.test/test.png",
    ...overrides
  };
}
