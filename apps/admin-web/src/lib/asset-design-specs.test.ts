import { describe, expect, it } from "vitest";
import { formatDesignSpecForPrompt, getProductionAssetDesignSpec } from "./asset-design-specs.js";

describe("production asset design specs", () => {
  it("defines scene designs as reusable multi-angle environment sheets", () => {
    const spec = getProductionAssetDesignSpec("scene_design");

    expect(spec.title).toContain("场景设定表");
    expect(spec.title).toContain("多角度");
    expect(spec.title).toContain("Environment Bible");
    expect(spec.deliverables).toContain("主建立镜头 / wide establishing view");
    expect(spec.deliverables).toContain("反打或侧向视角 / reverse or side view");
    expect(spec.deliverables).toContain("低机位或高机位辅助视角 / alternate camera height");
    expect(spec.deliverables).toContain("入口 / 动线视角");
    expect(spec.deliverables).toContain("无文字空间平面关系");
    expect(spec.deliverables).toContain("关键道具特写");
    expect(spec.deliverables).toContain("可复用机位范围与安全构图边界");
    expect(spec.checks.join(" ")).toContain("同一地点");
    expect(spec.checks.join(" ")).toContain("单张好看的背景图");
    expect(spec.usage).toContain("Seedance");
  });

  it("keeps character, scene, style, and frame assets as different reusable contracts", () => {
    expect(getProductionAssetDesignSpec("character_design").title).toContain("三视图");
    expect(getProductionAssetDesignSpec("style_reference").purpose).toContain("视觉锚点");
    expect(getProductionAssetDesignSpec("first_frame").usage).toContain("first_frame");
    expect(getProductionAssetDesignSpec("last_frame").purpose).toContain("结束画面");
  });

  it("formats the spec into generation prompts so UI and AI requests share the same contract", () => {
    const promptSpec = formatDesignSpecForPrompt("scene_design");

    expect(promptSpec).toContain("资产规格");
    expect(promptSpec).toContain("必须交付");
    expect(promptSpec).toContain("检查标准");
    expect(promptSpec).toContain("主建立镜头");
  });
});
