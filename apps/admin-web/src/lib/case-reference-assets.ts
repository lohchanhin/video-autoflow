import type { GenerationReferenceAsset, ProductionAsset } from "@ai-content-factory/shared-types";

export function isReadyReferenceAsset(asset: ProductionAsset): boolean {
  return Boolean(asset.url.trim()) && (asset.status === "approved" || asset.status === "ready");
}

export function isCharacterDesignAsset(asset: ProductionAsset): boolean {
  return asset.type === "character_design";
}

export function isBackgroundDesignAsset(asset: ProductionAsset): boolean {
  return asset.type === "scene_design" || asset.type === "style_reference" || asset.type === "first_frame";
}

export function buildAssetContextBrief(characterAsset: ProductionAsset | null, backgroundAsset: ProductionAsset | null): string {
  const lines = [
    characterAsset
      ? [
          "Selected optional character reference:",
          `- Label: ${characterAsset.label}`,
          `- Visual brief: ${cleanAssetTextForCaseBrief(characterAsset)}`,
          characterAsset.url ? "- Use this as the protagonist identity / wardrobe / silhouette reference when compatible with the user idea." : ""
        ].filter(Boolean).join("\n")
      : "",
    backgroundAsset
      ? [
          "Selected optional background / scene reference:",
          `- Label: ${backgroundAsset.label}`,
          `- Visual brief: ${cleanAssetTextForCaseBrief(backgroundAsset)}`,
          backgroundAsset.url ? "- Use this as the environment, color, lighting, and set-design reference when compatible with the user idea." : ""
        ].filter(Boolean).join("\n")
      : ""
  ].filter(Boolean);

  if (lines.length === 0) {
    return "";
  }

  return [
    "Optional selected production references. They guide visual continuity, but the user's idea remains highest priority.",
    "Use only the visual facts below. Do not copy asset-generation instructions, labels, UI words, or prompt-engineering text into the script, storyboard, or image prompts.",
    ...lines
  ].join("\n");
}

export function productionAssetToGenerationReference(asset: ProductionAsset): GenerationReferenceAsset | null {
  if (!isReadyReferenceAsset(asset)) {
    return null;
  }

  return {
    label: asset.label,
    notes: asset.notes || undefined,
    prompt: asset.prompt || undefined,
    role: asset.role,
    type: asset.type,
    url: asset.url
  };
}

function cleanAssetTextForCaseBrief(asset: ProductionAsset): string {
  const extractedUserBrief = extractUserDesignBrief(asset.prompt);
  const source = extractedUserBrief || asset.notes || asset.prompt || asset.label;
  const cleaned = source
    .split(/\n+/u)
    .map((line) => line.trim())
    .filter(Boolean)
    .filter((line) => !isInternalAssetInstruction(line))
    .join(" ")
    .replace(/\s+/gu, " ")
    .trim();

  return truncateForBrief(cleaned || asset.label, 360);
}

function extractUserDesignBrief(prompt: string): string {
  const match = prompt.match(
    /USER DESIGN BRIEF:\s*([\s\S]*?)(?:\n(?:用户描述是最高优先级|输出规格|Frame specification|The three views|Preserve the requested|Background rule|Purpose:|Fallback continuity|Fallback style|Do not create|Negative prompt:)|$)/iu
  );

  return match?.[1]?.trim() ?? "";
}

function isInternalAssetInstruction(value: string): boolean {
  const normalized = value.toLowerCase();
  return [
    "create one production-ready",
    "highest priority:",
    "user design brief:",
    "frame specification:",
    "the three views must",
    "preserve the requested art style",
    "background rule:",
    "purpose:",
    "fallback continuity",
    "fallback style",
    "do not create",
    "negative prompt:",
    "用户描述是最高优先级",
    "输出规格",
    "三视图必须",
    "禁止："
  ].some((phrase) => normalized.includes(phrase.toLowerCase()));
}

function truncateForBrief(value: string, maxLength: number): string {
  return value.length > maxLength ? `${value.slice(0, maxLength).trim()}...` : value;
}
