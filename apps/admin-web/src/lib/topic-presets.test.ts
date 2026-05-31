import { describe, expect, it } from "vitest";
import { buildDefaultBrief } from "./topic-presets.js";

describe("default brief builder", () => {
  it("builds a reviewable brief from topic and genre without presets", () => {
    const brief = buildDefaultBrief({
      genre: "科幻推理",
      language: "zh-CN",
      sceneCount: 5,
      templateType: "rules_horror",
      topic: "凌晨三点的电梯规则"
    });

    expect(brief).toContain("凌晨三点的电梯规则");
    expect(brief).toContain("科幻推理");
    expect(brief).toContain("5");
    expect(brief).toContain("45 秒");
    expect(brief).toContain("背景音乐要求");
  });

  it("supports non-horror genres as first-class production templates", () => {
    const comedyBrief = buildDefaultBrief({
      genre: "喜剧短剧",
      language: "zh-CN",
      sceneCount: 5,
      templateType: "comedy_sketch",
      topic: "办公室咖啡机误会"
    });
    const romanceBrief = buildDefaultBrief({
      genre: "爱情故事",
      language: "zh-CN",
      sceneCount: 5,
      templateType: "romance_story",
      topic: "雨天书店里的错拿书签"
    });
    const fairyTaleBrief = buildDefaultBrief({
      genre: "童话故事",
      language: "zh-CN",
      sceneCount: 5,
      templateType: "fairy_tale",
      topic: "会烤星星的月亮面包店"
    });

    expect(comedyBrief).toContain("喜剧短剧");
    expect(romanceBrief).toContain("爱情故事");
    expect(fairyTaleBrief).toContain("童话故事");
    expect(comedyBrief).not.toContain("恐怖");
  });
});
