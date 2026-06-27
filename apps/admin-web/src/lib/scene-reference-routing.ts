import type { GenerationReferenceAsset, ProductionAsset } from "@ai-content-factory/shared-types";
import type { SceneReviewItem } from "./jobs.js";
import { getProductionAssetMediaUrl, productionAssetToGenerationReference } from "./case-reference-assets.js";

export interface SceneReferenceRoutingInput {
  imagePrompt?: string | undefined;
  sceneId: number;
  visual?: string | undefined;
  voiceText?: string | undefined;
}

const maxCharacterReferences = 2;
const maxSceneReferences = 1;
const maxStyleReferences = 1;
const fallbackCompositePhrases = [
  "reference composite",
  "composed from approved reference assets",
  "local-reference-composite",
  "fallback composite",
  "production composite",
  "参考图拼贴",
  "本地拼贴",
  "参考资产拼贴"
];

export function selectSceneProductionAssetsForGeneration(assets: ProductionAsset[], input: SceneReferenceRoutingInput): ProductionAsset[] {
  const readyAssets = uniqueProductionAssets(assets.filter((asset) => Boolean(getProductionAssetMediaUrl(asset))));
  const sceneText = buildSceneRoutingText(input);
  const scoredAssets = readyAssets
    .map((asset) => ({ asset, score: scoreProductionAssetForScene(asset, sceneText, input.sceneId) }))
    .filter((entry) => entry.score > 0)
    .sort((left, right) => right.score - left.score || assetTypePriority(left.asset) - assetTypePriority(right.asset) || left.asset.label.localeCompare(right.asset.label));

  const sceneSpecific = scoredAssets
    .filter((entry) => entry.asset.sceneId === input.sceneId && entry.asset.type !== "first_frame" && entry.asset.type !== "last_frame")
    .map((entry) => entry.asset);
  const characters = scoredAssets
    .filter((entry) => entry.asset.type === "character_design")
    .map((entry) => entry.asset)
    .slice(0, maxCharacterReferences);
  const scenes = scoredAssets
    .filter((entry) => entry.asset.type === "scene_design")
    .map((entry) => entry.asset)
    .slice(0, maxSceneReferences);
  const styles = scoredAssets
    .filter((entry) => entry.asset.type === "style_reference")
    .map((entry) => entry.asset)
    .slice(0, maxStyleReferences);

  const explicitMatches = uniqueProductionAssets([...sceneSpecific, ...characters, ...scenes, ...styles]);

  if (explicitMatches.length > 0) {
    return explicitMatches;
  }

  return selectConservativeFallbackAssets(readyAssets);
}

export function selectSceneGenerationReferences(references: GenerationReferenceAsset[], input: SceneReferenceRoutingInput): GenerationReferenceAsset[] {
  const sceneText = buildSceneRoutingText(input);
  const scoredReferences = uniqueGenerationReferences(references)
    .map((reference) => ({ reference, score: scoreGenerationReferenceForScene(reference, sceneText) }))
    .filter((entry) => entry.score > 0)
    .sort((left, right) => right.score - left.score || referenceTypePriority(left.reference) - referenceTypePriority(right.reference) || left.reference.label.localeCompare(right.reference.label));

  const characters = scoredReferences
    .filter((entry) => entry.reference.type === "character_design")
    .map((entry) => entry.reference)
    .slice(0, maxCharacterReferences);
  const scenes = scoredReferences
    .filter((entry) => entry.reference.type === "scene_design")
    .map((entry) => entry.reference)
    .slice(0, maxSceneReferences);
  const styles = scoredReferences
    .filter((entry) => entry.reference.type === "style_reference")
    .map((entry) => entry.reference)
    .slice(0, maxStyleReferences);
  const explicitMatches = uniqueGenerationReferences([...characters, ...scenes, ...styles]);

  if (explicitMatches.length > 0) {
    return explicitMatches;
  }

  return selectConservativeFallbackReferences(references);
}

export function isSceneReviewBlockingForProduction(review: Pick<SceneReviewItem, "notes" | "qcIssues" | "qcStatus" | "qcSummary" | "status">): boolean {
  if (review.status === "needs_review" || review.status === "rejected" || review.qcStatus === "fail") {
    return true;
  }

  return isReferenceCompositeFallbackText([review.notes, review.qcSummary, ...review.qcIssues].join(" "));
}

export function isReferenceCompositeFallbackText(value: string | undefined): boolean {
  const normalized = normalizeForRouting(value ?? "");

  return fallbackCompositePhrases.some((phrase) => normalized.includes(normalizeForRouting(phrase)));
}

function selectConservativeFallbackAssets(assets: ProductionAsset[]): ProductionAsset[] {
  const characters = assets.filter((asset) => asset.type === "character_design");
  const scenes = assets.filter((asset) => asset.type === "scene_design");
  const styles = assets.filter((asset) => asset.type === "style_reference");

  return uniqueProductionAssets([
    ...(characters.length === 1 ? characters : []),
    ...(scenes.length === 1 ? scenes : []),
    ...(styles.length === 1 ? styles : [])
  ]);
}

function selectConservativeFallbackReferences(references: GenerationReferenceAsset[]): GenerationReferenceAsset[] {
  const uniqueReferences = uniqueGenerationReferences(references);
  const characters = uniqueReferences.filter((reference) => reference.type === "character_design");
  const scenes = uniqueReferences.filter((reference) => reference.type === "scene_design");
  const styles = uniqueReferences.filter((reference) => reference.type === "style_reference");

  return uniqueGenerationReferences([
    ...(characters.length === 1 ? characters : []),
    ...(scenes.length === 1 ? scenes : []),
    ...(styles.length === 1 ? styles : [])
  ]);
}

function scoreProductionAssetForScene(asset: ProductionAsset, sceneText: string, sceneId: number): number {
  let score = asset.sceneId === sceneId ? 100 : 0;
  score += scoreTextMatch(sceneText, [asset.label, asset.folderName, asset.tags, asset.prompt, asset.notes].flat().join(" "));

  if (asset.sceneId !== null && asset.sceneId !== sceneId) {
    score -= 100;
  }

  return score;
}

function scoreGenerationReferenceForScene(reference: GenerationReferenceAsset, sceneText: string): number {
  return scoreTextMatch(sceneText, [reference.label, reference.prompt ?? "", reference.notes ?? ""].join(" "));
}

function scoreTextMatch(sceneText: string, assetText: string): number {
  const aliases = buildAssetAliases(assetText);

  return aliases.reduce((score, alias) => {
    if (!alias || !sceneText.includes(alias)) {
      return score;
    }

    return score + Math.min(30, Math.max(4, alias.length));
  }, 0);
}

function buildSceneRoutingText(input: SceneReferenceRoutingInput): string {
  return normalizeForRouting([input.imagePrompt, input.visual, input.voiceText].filter(Boolean).join(" "));
}

function buildAssetAliases(value: string): string[] {
  const normalized = normalizeForRouting(value)
    .replace(/角色参考|背景参考|场景参考|角色设计|场景设计|风格参考|三视图|设定表/gu, " ");
  const rawTokens = normalized
    .split(/[\s,，。/／|:：;；()[\]{}"'“”‘’<>《》\-_=+!?！？]+/u)
    .map((token) => token.trim())
    .filter((token) => token.length >= 2);
  const aliases = new Set<string>();

  for (const token of rawTokens) {
    aliases.add(token);

    if (/[\u4e00-\u9fff]/u.test(token)) {
      for (let size = 2; size <= Math.min(4, token.length); size += 1) {
        for (let index = 0; index <= token.length - size; index += 1) {
          aliases.add(token.slice(index, index + size));
        }
      }
    }
  }

  return [...aliases].filter((alias) => !isWeakAlias(alias));
}

function normalizeForRouting(value: string): string {
  return value
    .toLowerCase()
    .normalize("NFKC")
    .replace(/\s+/gu, " ")
    .trim();
}

function isWeakAlias(alias: string): boolean {
  return new Set([
    "case",
    "job",
    "scene",
    "角色",
    "参考",
    "背景",
    "场景",
    "设计",
    "风格",
    "资产",
    "图片",
    "视频",
    "人物",
    "主角",
    "总裁",
    "老板",
    "员工",
    "店员",
    "秘书",
    "老师",
    "同学",
    "朋友",
    "前任",
    "主厨",
    "经理"
  ]).has(alias);
}

function uniqueProductionAssets(assets: ProductionAsset[]): ProductionAsset[] {
  const seen = new Set<string>();

  return assets.filter((asset) => {
    const key = getProductionAssetMediaUrl(asset) || asset._id;

    if (seen.has(key)) {
      return false;
    }

    seen.add(key);
    return true;
  });
}

function uniqueGenerationReferences(references: GenerationReferenceAsset[]): GenerationReferenceAsset[] {
  const seen = new Set<string>();

  return references.filter((reference) => {
    const key = reference.url || `${reference.type}:${reference.label}`;

    if (seen.has(key)) {
      return false;
    }

    seen.add(key);
    return true;
  });
}

function assetTypePriority(asset: ProductionAsset): number {
  return typePriority(asset.type);
}

function referenceTypePriority(reference: GenerationReferenceAsset): number {
  return typePriority(reference.type);
}

function typePriority(type: ProductionAsset["type"]): number {
  const priorities: Record<ProductionAsset["type"], number> = {
    character_design: 0,
    scene_design: 1,
    style_reference: 2,
    first_frame: 3,
    last_frame: 4,
    bgm_reference: 5
  };

  return priorities[type];
}

export function productionAssetsToSceneGenerationReferences(assets: ProductionAsset[], input: SceneReferenceRoutingInput): GenerationReferenceAsset[] {
  return selectSceneProductionAssetsForGeneration(assets, input)
    .map(productionAssetToGenerationReference)
    .filter((reference): reference is GenerationReferenceAsset => Boolean(reference));
}
