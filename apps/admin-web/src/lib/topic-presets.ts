import type { AdminJob } from "./jobs.js";

export function buildDefaultBrief(input: {
  genre?: string | undefined;
  language: AdminJob["language"];
  sceneCount: number;
  templateType: AdminJob["templateType"];
  topic: string;
}): string {
  const customGenre = input.genre?.trim();
  const templateLabel = customGenre || (input.language === "en-US" ? "AI-selected best-fit" : "AI 自动判断最适合");
  const direction = customGenre
    ? getTemplateDirection(input.templateType, input.language)
    : input.language === "en-US"
      ? "Choose the most suitable genre, tone, structure, and pacing from the user's idea. Do not force horror, romance, comedy, or urban legend unless the idea implies it."
      : "请根据用户输入自动判断最适合的影片类型、风格、结构和节奏。不要强行套恐怖、爱情、喜剧或都市传说，除非用户输入本身暗示。";

  if (input.language === "en-US") {
    return [
      `Create a 45-second fictional YouTube Shorts video about "${input.topic}".`,
      `Use the ${templateLabel} format with ${input.sceneCount} clear scenes.`,
      direction,
      "Stay tightly centered on the exact user topic; do not replace it with another premise or setting.",
      "Output must support review before production: title, full voiceover script, storyboard scenes, image prompts, SFX cues, and a background music brief.",
      "Safety: no real people, no minors in risky situations, no explicit sexual content, no gore, no harassment, and no copyrighted characters."
    ].join(" ");
  }

  return [
    `制作一支 45 秒虚构 YouTube Shorts，主题是「${input.topic}」。`,
    `采用「${templateLabel}」类型，拆成 ${input.sceneCount} 个清楚场景。`,
    direction,
    "必须严格围绕用户输入主题，不要换成其他地点、物件或故事前提。",
    "输出要方便审核：标题、完整旁白脚本、分镜场景、图片提示词、SFX，以及背景音乐要求。",
    "安全要求：无真实人物、无未成年人风险、无露骨性内容、无血腥 gore、无羞辱骚扰、无版权角色。"
  ].join("");
}

function getTemplateDirection(templateType: AdminJob["templateType"], language: AdminJob["language"]): string {
  const directions: Record<AdminJob["templateType"], { en: string; zh: string }> = {
    comedy_sketch: {
      en: "Tone: light, sharp, misunderstanding-driven, with a clear final joke and no cruelty.",
      zh: "风格：轻松、误会驱动、反差明显，结尾要有明确笑点，不靠羞辱或低俗内容。"
    },
    fairy_tale: {
      en: "Tone: whimsical, warm, imaginative, all-ages friendly, with an original magical rule and no copyrighted characters.",
      zh: "风格：奇幻、温柔、适合全年龄，设定要原创，不使用任何版权角色。"
    },
    romance_story: {
      en: "Tone: warm, restrained, emotionally clear, romantic without explicit sexual content.",
      zh: "风格：温暖、克制、情绪清楚，浪漫但不露骨。"
    },
    rules_horror: {
      en: "Tone: suspenseful, low-violence, rule-based, with a violation, twist, and ending hook.",
      zh: "风格：低暴力悬疑、规则驱动，要有违规、反转和结尾钩子。"
    },
    surveillance_horror: {
      en: "Tone: surveillance suspense, low-violence, unsettling details, no gore.",
      zh: "风格：监控悬疑、低暴力，靠细节制造不安，无血腥。"
    },
    urban_legend: {
      en: "Tone: modern urban legend, believable setup, fast mystery escalation, clear twist.",
      zh: "风格：现代都市传说，开场可信，悬念快速升级，反转清楚。"
    }
  };

  return language === "en-US" ? directions[templateType].en : directions[templateType].zh;
}
