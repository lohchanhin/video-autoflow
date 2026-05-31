import type { ContentTemplateType } from "@ai-content-factory/shared-types";

export const genreSuggestions = [
  "恐怖规则",
  "监控悬疑",
  "都市传说",
  "喜剧短剧",
  "爱情故事",
  "童话故事",
  "科幻故事",
  "奇幻冒险",
  "职场故事",
  "家庭故事",
  "知识科普",
  "商业案例",
  "励志故事",
  "悬疑反转"
] as const;

export function inferTemplateTypeFromGenre(value: string): ContentTemplateType {
  const genre = value.trim().toLocaleLowerCase();

  if (!genre) {
    return "urban_legend";
  }

  if (/(规则|恐怖|horror|rule)/iu.test(genre)) {
    return "rules_horror";
  }

  if (/(监控|cctv|surveillance|录像)/iu.test(genre)) {
    return "surveillance_horror";
  }

  if (/(喜剧|搞笑|comedy|sketch|笑)/iu.test(genre)) {
    return "comedy_sketch";
  }

  if (/(爱情|恋爱|romance|love)/iu.test(genre)) {
    return "romance_story";
  }

  if (/(童话|fairy|寓言|儿童|魔法)/iu.test(genre)) {
    return "fairy_tale";
  }

  return "urban_legend";
}

