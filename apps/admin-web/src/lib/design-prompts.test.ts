import { describe, expect, it } from "vitest";
import { buildDesignPromptForType, designHintForType, examplePromptForType } from "./design-prompts.js";

describe("design asset prompts", () => {
  it("generates scene design prompts as multi-angle environment sheets", () => {
    const prompt = buildDesignPromptForType("scene_design", "雨夜便利店，冷白荧光灯，旧监控屏和咖啡机。");

    expect(prompt).toContain("environment design sheet");
    expect(prompt).toContain("主建立镜头");
    expect(prompt).toContain("反打或侧向视角");
    expect(prompt).toContain("入口/动线视角");
    expect(prompt).toContain("关键道具特写");
    expect(prompt).toContain("所有视角必须属于同一空间");
    expect(prompt).not.toContain("单张可复用设计参考图");
  });

  it("keeps style references as single visual anchors instead of scene layouts", () => {
    const prompt = buildDesignPromptForType("style_reference", "低饱和蓝绿色调，真实电影感。");

    expect(prompt).toContain("单张可复用视觉风格参考图");
    expect(prompt).not.toContain("入口/动线视角");
  });

  it("explains scene design consistency in the UI hint and example", () => {
    expect(designHintForType("scene_design")).toContain("主视角");
    expect(designHintForType("scene_design")).toContain("关键道具");
    expect(examplePromptForType("scene_design")).toContain("同一空间布局");
  });
});
