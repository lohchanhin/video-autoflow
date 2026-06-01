import type { ProductionAssetType } from "@ai-content-factory/shared-types";
import { formatDesignSpecForPrompt } from "./asset-design-specs.js";

export function buildDesignPromptForType(type: ProductionAssetType, prompt: string): string {
  const trimmedPrompt = prompt.trim();

  if (type === "character_design") {
    return [
      trimmedPrompt,
      "用户描述是最高优先级：不要改变用户指定的题材、服装、盔甲、武器、发色、瞳色、画风、背景、时代、情绪或固定道具。",
      "输出规格：角色三视图设定稿，一张图内包含同一原创成年角色的正面、侧面、背面全身视图。",
      "三视图必须保持同一张脸、同一发型、同一体型、同一服装/盔甲细节、同一固定道具和同一色彩方案。",
      "画风必须跟随用户描述；如果用户写 anime / 插画 / 写实 / 电影感，就按用户描述执行。",
      "如果用户指定背景或地点，保留为三视图背后的统一弱背景；如果没有指定，才使用干净中性背景。",
      formatDesignSpecForPrompt(type),
      "禁止：文字、标签、UI、表格、漫画格、分镜格、多人变体、儿童角色、版权角色。"
    ].join("\n");
  }

  if (type === "scene_design") {
    return [
      trimmedPrompt,
      "用户描述是最高优先级：不要改变用户指定的地点、时代、画风、色彩、物件、灯光、天气、材质或情绪。",
      "输出规格：专业场景设定表 / environment bible sheet，一张图内包含同一地点的 6-8 个一致视角和细节，不是单张背景图。",
      "必须包含：主建立镜头、反打或侧向视角、低机位或高机位辅助视角、入口/动线视角、无文字俯视空间关系、关键道具特写、材质与灯光细节、可复用机位范围与安全构图边界。所有视角必须属于同一空间。",
      "一致性要求：门窗、家具、道具、主要色彩、灯光方向、空间比例、材质语言、时代风格必须在所有视角中保持一致。",
      "如果展示空间关系，使用无文字的俯视布局或平面构图表达动线；可以有视觉框线和局部放大，但不要生成标签文字或说明框。",
      "目的：后续图片和 Seedance 影片生成会使用这张图锁定场景布局、道具位置、灯光和色彩，避免每次生成漂移。",
      formatDesignSpecForPrompt(type),
      "允许专业设计 sheet 的多视角布局；禁止文字标签、说明文字、UI、故事分镜、时间序列漫画格、多个无关地点、随机拼贴。"
    ].join("\n");
  }

  if (type === "style_reference") {
    return [
      trimmedPrompt,
      "用户描述是最高优先级：不要改变用户指定的画风、色彩、镜头质感、材质、灯光或情绪。",
      "输出规格：单张可复用视觉风格参考图，主体清楚，色彩和光影稳定，适合作为整支影片的风格锚点。",
      formatDesignSpecForPrompt(type),
      "禁止：文字、标签、UI、表格、漫画格、分镜格、拼贴板、对比图。"
    ].join("\n");
  }

  return [
    trimmedPrompt,
    "用户描述是最高优先级：不要改变用户指定的地点、画风、色彩、物件、灯光、角色或动作。",
    "输出规格：单张可复用影片帧，主体动作清楚，构图稳定，适合作为后续图片或视频生成参考。",
    formatDesignSpecForPrompt(type),
    "禁止：文字、标签、UI、表格、漫画格、分镜格、拼贴板、对比图。"
  ].join("\n");
}

export function designHintForType(type: ProductionAssetType): string {
  if (type === "character_design") {
    return "角色设计会按三视图生成：正面、侧面、背面，同一成年角色、同一服装、无文字标签，方便后续作为 Seedance 参考图。";
  }

  if (type === "scene_design") {
    return "场景设定表会按 Environment Bible 生成：6-8 个一致视角、主视角、反打/侧向、辅助机位、入口动线、无文字俯视空间关系、关键道具、材质和灯光细节，用来锁定后续镜头的一致性。";
  }

  if (type === "style_reference") {
    return "风格参考会按单张视觉锚点生成，用来锁定色调、光影、材质和镜头质感，不承担场景空间布局。";
  }

  return "首帧和尾帧会按单张可复用影片帧生成，避免表格、字幕、UI 和分镜格。";
}

export function examplePromptForType(type: ProductionAssetType): string {
  if (type === "character_design") {
    return "生成一个原创成年主角的三视图设定稿。亚洲男性，30岁左右，夜班便利店员工，短黑发，疲惫但敏锐，蓝色制服，固定道具是一串旧收银机钥匙。需要同一角色的正面、侧面、背面全身视图，同一张脸、同一服装、同一体型，中性干净背景，无文字、无标签、无UI。";
  }

  if (type === "scene_design") {
    return "生成一个雨夜便利店的 Environment Bible 场景设定表。冷白荧光灯，玻璃门外有雨水反光，货架排列清楚，收银台、旧监控屏、咖啡机作为固定道具。需要同一地点的 6-8 个一致视角：主建立镜头、反打/侧向视角、低机位或高机位辅助视角、入口动线、无文字俯视空间关系、收银台细节、咖啡机和监控屏特写、材质灯光细节与可复用机位范围。所有角度保持同一空间布局、同一灯光和同一道具位置。无文字、无招牌文字、无故事分镜。";
  }

  if (type === "style_reference") {
    return "生成一张短片视觉风格参考图。现代城市夜景、低饱和蓝绿色调、真实电影感、浅景深、细雨、柔和噪点。用于保持整支影片色调一致。无文字、无拼贴、无UI。";
  }

  return "生成一张可作为影片首帧或尾帧的竖屏电影画面。主体动作清楚，角色和环境一致，画面无文字、无字幕、无UI、无分镜格。";
}
