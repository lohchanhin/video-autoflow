import { describe, expect, it } from "vitest";
import { buildDesignPromptForType, designHintForType, designPromptPlaceholderForType, examplePromptForType } from "./design-prompts.js";

describe("design asset prompts", () => {
  it("generates scene design prompts as multi-angle environment sheets", () => {
    const prompt = buildDesignPromptForType("scene_design", "雨夜便利店，冷白荧光灯，旧监控屏和咖啡机。");

    expect(prompt).toContain("environment bible sheet");
    expect(prompt).toContain("6-8 个一致视角");
    expect(prompt).toContain("主建立镜头");
    expect(prompt).toContain("反打或侧向视角");
    expect(prompt).toContain("低机位或高机位辅助视角");
    expect(prompt).toContain("入口/动线视角");
    expect(prompt).toContain("无文字俯视空间关系");
    expect(prompt).toContain("无文字的俯视布局");
    expect(prompt).toContain("关键道具特写");
    expect(prompt).toContain("可复用机位范围");
    expect(prompt).toContain("安全构图边界");
    expect(prompt).toContain("所有视角必须属于同一空间");
    expect(prompt).toContain("资产规格：场景设定表 / 多角度 Environment Bible 规格");
    expect(prompt).toContain("必须交付");
    expect(prompt).not.toContain("单张可复用设计参考图");
  });

  it("keeps style references as single visual anchors instead of scene layouts", () => {
    const prompt = buildDesignPromptForType("style_reference", "低饱和蓝绿色调，真实电影感。");

    expect(prompt).toContain("单张可复用视觉风格参考图");
    expect(prompt).not.toContain("入口/动线视角");
  });

  it("explains scene design consistency in the UI hint and example", () => {
    expect(designHintForType("scene_design")).toContain("6-8 个一致视角");
    expect(designHintForType("scene_design")).toContain("主视角");
    expect(designHintForType("scene_design")).toContain("无文字俯视空间关系");
    expect(designHintForType("scene_design")).toContain("关键道具");
    expect(examplePromptForType("scene_design")).toContain("Environment Bible 场景设定表");
    expect(examplePromptForType("scene_design")).toContain("6-8 个一致视角");
    expect(examplePromptForType("scene_design")).toContain("无文字俯视空间关系");
    expect(examplePromptForType("scene_design")).toContain("同一空间布局");
  });

  it("uses type-specific placeholders so scene design is not prompted like a character asset", () => {
    expect(designPromptPlaceholderForType("character_design")).toContain("角色三视图");
    expect(designPromptPlaceholderForType("scene_design")).toContain("场景设定表");
    expect(designPromptPlaceholderForType("scene_design")).toContain("6-8 个一致视角");
    expect(designPromptPlaceholderForType("scene_design")).not.toContain("角色三视图");
  });
});
