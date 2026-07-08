import type { ProductionAsset, ProductionAssetType } from "@ai-content-factory/shared-types";
import { isImageMediaUrl, resolveFirstMediaUrl, resolveMediaUrl } from "./media-url.js";

const visualProductionAssetTypes = new Set<ProductionAssetType>([
  "character_design",
  "scene_design",
  "style_reference",
  "first_frame",
  "last_frame"
]);

export function isVisualProductionAssetType(type: ProductionAssetType): boolean {
  return visualProductionAssetTypes.has(type);
}

export function resolveProductionAssetMediaUrl(asset: ProductionAsset): string {
  return resolveFirstMediaUrl([asset.storagePath, asset.url]);
}

export function resolveProductionAssetMediaUrls(asset: ProductionAsset): string[] {
  const seen = new Set<string>();
  const urls: string[] = [];

  for (const value of [asset.storagePath, asset.url]) {
    const resolved = resolveMediaUrl(value);

    if (!resolved || seen.has(resolved)) {
      continue;
    }

    seen.add(resolved);
    urls.push(resolved);
  }

  return urls;
}

export function resolveProductionAssetPreviewUrl(asset: ProductionAsset): string {
  return resolveProductionAssetPreviewUrls(asset)[0] ?? "";
}

export function resolveProductionAssetPreviewUrls(asset: ProductionAsset): string[] {
  return resolveProductionAssetMediaUrls(asset).filter((mediaUrl) => {
    if (isKnownNonImageMediaUrl(mediaUrl)) {
      return false;
    }

    return isVisualProductionAssetType(asset.type) || isImageMediaUrl(mediaUrl);
  });
}

function isKnownNonImageMediaUrl(value: string): boolean {
  return /\.(aac|csv|docx?|flac|json|m4a|mov|mp3|mp4|ogg|opus|pdf|srt|txt|wav|webm|xlsx?)(\?|$)/iu.test(value);
}
