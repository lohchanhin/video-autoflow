import type { ProductionAssetType } from "@ai-content-factory/shared-types";

export interface ProductionAssetDesignSpec {
  checks: string[];
  deliverables: string[];
  purpose: string;
  title: string;
  usage: string;
}

const assetDesignSpecs: Record<ProductionAssetType, ProductionAssetDesignSpec> = {
  bgm_reference: {
    checks: [
      "情绪、速度、乐器和段落变化清楚",
      "不绑定单一视频题材，可被同系列复用",
      "不包含版权歌曲、歌词或可识别旋律要求"
    ],
    deliverables: [
      "音乐情绪与节奏",
      "乐器 / 音色范围",
      "起承转合结构",
      "可循环或可剪辑说明"
    ],
    purpose: "锁定系列或 Case 的音乐方向，给 ElevenLabs Music 或其他 BGM 工具作为生成依据。",
    title: "BGM 参考规格",
    usage: "用于 BGM 生成，不传给图片或视频模型。"
  },
  character_design: {
    checks: [
      "正面、侧面、背面是同一个原创成年角色",
      "脸、发型、体型、服装、固定道具和色彩方案一致",
      "没有文字标签、UI、漫画格、多人变体或版权角色",
      "画风严格跟随用户 prompt，不用系统默认风格覆盖"
    ],
    deliverables: [
      "正面全身视图",
      "侧面全身视图",
      "背面全身视图",
      "固定服装 / 道具细节",
      "统一弱背景或中性背景"
    ],
    purpose: "作为可重复角色资产，锁定人物外观，后续生成场景图、首帧和 Seedance 影片时作为角色参考。",
    title: "角色三视图规格",
    usage: "可作为 reference_image 传给图片模型和 Seedance，避免每一集或每个镜头角色漂移。"
  },
  first_frame: {
    checks: [
      "画面是单一可拍镜头，不是拼贴或分镜板",
      "角色、场景、道具与已批准设计资产一致",
      "主体动作和镜头方向清楚",
      "没有字幕、文字、UI 或表格"
    ],
    deliverables: [
      "竖屏 9:16 首帧",
      "清楚主体动作",
      "镜头构图和运动起点",
      "可传给视频模型的图像参考"
    ],
    purpose: "锁定某个 scene 的影片起始画面，让视频模型从明确首帧开始生成。",
    title: "首帧规格",
    usage: "作为 Seedance first_frame 或 image-to-video 输入。"
  },
  last_frame: {
    checks: [
      "画面是单一可拍镜头，不是故事板或对比图",
      "与首帧和场景设计保持同一空间关系",
      "结尾动作或情绪落点清楚",
      "没有字幕、文字、UI 或表格"
    ],
    deliverables: [
      "竖屏 9:16 尾帧",
      "结尾姿态 / 构图",
      "与首帧一致的角色和环境",
      "可用于视频模型收束画面的图像参考"
    ],
    purpose: "锁定某个 scene 的影片结束画面，降低视频片段运动漂移。",
    title: "尾帧规格",
    usage: "作为支持首尾帧的视频模型输入；不支持时仍作为人工审核参考。"
  },
  scene_design: {
    checks: [
      "所有角度属于同一地点，不是多个随机地点拼贴",
      "门窗、家具、道具位置、灯光方向和空间比例一致",
      "包含关键道具、材质、灯光和动线细节",
      "没有文字标签、说明文字、UI、故事分镜或时间序列漫画格"
    ],
    deliverables: [
      "主建立镜头",
      "反打或侧向视角",
      "入口 / 动线视角",
      "无文字空间平面关系",
      "关键道具特写",
      "材质与灯光细节",
      "色彩和空间比例规则"
    ],
    purpose: "作为可重复场景资产，锁定地点布局、道具位置、灯光和色彩，后续每个镜头都引用同一套环境规则。",
    title: "场景多角度设定表规格",
    usage: "可作为 reference_image 传给图片模型和 Seedance，避免同一地点在不同镜头中漂移。"
  },
  style_reference: {
    checks: [
      "只锁定视觉风格，不承担场景空间布局",
      "色调、光影、镜头质感和材质方向明确",
      "不包含文字、UI、拼贴板或对比图",
      "可跨多个 Case 或系列复用"
    ],
    deliverables: [
      "色彩调性",
      "光影方向",
      "镜头质感",
      "材质和颗粒感",
      "整体情绪"
    ],
    purpose: "作为视觉锚点，保证同系列影片的画面质感统一。",
    title: "风格锚点规格",
    usage: "作为图片和视频生成的风格参考，不替代角色或场景设计。"
  }
};

export function getProductionAssetDesignSpec(type: ProductionAssetType): ProductionAssetDesignSpec {
  return assetDesignSpecs[type];
}

export function formatDesignSpecForPrompt(type: ProductionAssetType): string {
  const spec = getProductionAssetDesignSpec(type);
  return [
    `资产规格：${spec.title}`,
    `用途：${spec.purpose}`,
    `必须交付：${spec.deliverables.join("、")}。`,
    `检查标准：${spec.checks.join("；")}。`,
    `下游使用：${spec.usage}`
  ].join("\n");
}
