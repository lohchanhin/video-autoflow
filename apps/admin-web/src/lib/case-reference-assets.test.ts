import { describe, expect, it } from "vitest";
import type { ProductionAsset } from "@ai-content-factory/shared-types";
import {
  buildAssetContextBrief,
  buildAssetContextBriefFromAssets,
  buildReferenceAssetPromptContext,
  findReadyReferenceAssetsByIds,
  getProductionAssetsForCase,
  isBackgroundDesignAsset,
  isCharacterDesignAsset,
  isReadyReferenceAsset,
  productionAssetToGenerationReference
} from "./case-reference-assets.js";

describe("case reference asset routing", () => {
  it("only treats approved or ready assets with media URLs as generation references", () => {
    expect(isReadyReferenceAsset(createAsset({ status: "approved", url: "https://cdn.test/paladin.png" }))).toBe(true);
    expect(isReadyReferenceAsset(createAsset({ status: "ready", url: "https://cdn.test/paladin.png" }))).toBe(true);
    expect(isReadyReferenceAsset(createAsset({ status: "planned", url: "https://cdn.test/paladin.png" }))).toBe(false);
    expect(isReadyReferenceAsset(createAsset({ status: "approved", url: "" }))).toBe(true);
    expect(isReadyReferenceAsset(createAsset({ status: "approved", storagePath: "", url: "" }))).toBe(false);
  });

  it("classifies character and reusable background assets for case creation", () => {
    expect(isCharacterDesignAsset(createAsset({ type: "character_design" }))).toBe(true);
    expect(isBackgroundDesignAsset(createAsset({ type: "scene_design" }))).toBe(true);
    expect(isBackgroundDesignAsset(createAsset({ type: "style_reference" }))).toBe(true);
    expect(isBackgroundDesignAsset(createAsset({ type: "first_frame" }))).toBe(false);
    expect(isBackgroundDesignAsset(createAsset({ type: "last_frame" }))).toBe(false);
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
      storagePath: "",
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

  it("keeps all selected ready character and scene assets without duplicate IDs", () => {
    const paladin = createAsset({ _id: "asset_paladin", label: "Silver paladin", type: "character_design" });
    const rabbit = createAsset({ _id: "asset_rabbit", label: "Rabbit hero", type: "character_design" });
    const forest = createAsset({ _id: "asset_forest", label: "Rainbow forest", type: "scene_design" });
    const rejectedScene = createAsset({ _id: "asset_rejected", label: "Rejected scene", status: "rejected", type: "scene_design" });

    const selected = findReadyReferenceAssetsByIds(
      [paladin, rabbit, forest, rejectedScene],
      [["asset_paladin", "asset_rabbit"], ["asset_forest"], "asset_paladin", "asset_rejected", null]
    );

    expect(selected.map((asset) => asset._id)).toEqual(["asset_paladin", "asset_rabbit", "asset_forest"]);
  });

  it("shows inherited series assets on a case even before they are copied into case rows", () => {
    const rabbit = createAsset({
      _id: "asset_rabbit",
      label: "Rabbit hero",
      jobId: "asset_library",
      storagePath: "",
      type: "character_design",
      url: "https://cdn.test/rabbit.png"
    });
    const forest = createAsset({
      _id: "asset_forest",
      label: "Rainbow forest",
      jobId: "asset_library",
      storagePath: "",
      type: "scene_design",
      url: "https://cdn.test/forest.png"
    });
    const unrelated = createAsset({
      _id: "asset_unrelated",
      label: "Unrelated asset",
      jobId: "asset_library",
      storagePath: "",
      type: "scene_design",
      url: "https://cdn.test/unrelated.png"
    });

    const caseAssets = getProductionAssetsForCase({
      characterAssetIds: ["asset_rabbit"],
      id: "job_series_case",
      sceneAssetIds: ["asset_forest"]
    }, [rabbit, forest, unrelated]);

    expect(caseAssets.map((asset) => asset._id)).toEqual(["asset_rabbit", "asset_forest"]);
  });

  it("falls back to series-level reference IDs for existing converted cases", () => {
    const bananaCeo = createAsset({
      _id: "asset_banana_ceo",
      label: "Banana CEO",
      jobId: "asset_library",
      storagePath: "",
      type: "character_design",
      url: "https://cdn.test/banana-ceo.png"
    });

    const caseAssets = getProductionAssetsForCase({
      id: "job_existing_series_case",
      referenceAssetIds: ["asset_banana_ceo"]
    }, [bananaCeo]);

    expect(caseAssets.map((asset) => asset._id)).toEqual(["asset_banana_ceo"]);
  });

  it("prefers copied case asset rows over inherited library rows with the same media", () => {
    const libraryRabbit = createAsset({
      _id: "asset_rabbit",
      label: "Rabbit hero",
      jobId: "asset_library",
      storagePath: "",
      type: "character_design",
      url: "https://cdn.test/rabbit.png"
    });
    const copiedRabbit = createAsset({
      _id: "asset_rabbit_case_copy",
      label: "Character reference: Rabbit hero",
      jobId: "job_series_case",
      storagePath: "",
      type: "character_design",
      url: "https://cdn.test/rabbit.png"
    });

    const caseAssets = getProductionAssetsForCase({
      characterAssetIds: ["asset_rabbit"],
      id: "job_series_case"
    }, [libraryRabbit, copiedRabbit]);

    expect(caseAssets.map((asset) => asset._id)).toEqual(["asset_rabbit_case_copy"]);
  });

  it("builds a multi-reference case brief from every selected character and scene asset", () => {
    const rabbit = createAsset({
      _id: "asset_rabbit",
      label: "Mimi rabbit",
      prompt: "USER DESIGN BRIEF: white rabbit girl, pink dress, blue vest, warm smile, fixed pastel palette.",
      type: "character_design"
    });
    const tiger = createAsset({
      _id: "asset_tiger",
      label: "Huhu tiger",
      prompt: "USER DESIGN BRIEF: small orange tiger boy, blue cap, friendly classroom troublemaker.",
      type: "character_design"
    });
    const forest = createAsset({
      _id: "asset_forest",
      label: "Rainbow forest",
      prompt: "USER DESIGN BRIEF: rainbow forest clearing, candy-color trees, fixed mushroom props and curved path.",
      type: "scene_design"
    });
    const rejected = createAsset({
      _id: "asset_rejected",
      label: "Rejected reference",
      status: "rejected",
      type: "scene_design"
    });

    const brief = buildAssetContextBriefFromAssets([rabbit, tiger, forest, rejected]);

    expect(brief).toContain("Mimi rabbit");
    expect(brief).toContain("white rabbit girl");
    expect(brief).toContain("Huhu tiger");
    expect(brief).toContain("small orange tiger boy");
    expect(brief).toContain("Rainbow forest");
    expect(brief).toContain("rainbow forest clearing");
    expect(brief).not.toContain("Rejected reference");
    expect(brief).not.toContain("USER DESIGN BRIEF");
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
