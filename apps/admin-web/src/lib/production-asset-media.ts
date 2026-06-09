import type { ProductionAsset, ProductionAssetType } from "@ai-content-factory/shared-types";
import { isImageMediaUrl, resolveFirstMediaUrl } from "./media-url.js";

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

export function resolveProductionAssetPreviewUrl(asset: ProductionAsset): string {
  const mediaUrl = resolveProductionAssetMediaUrl(asset);

  if (!mediaUrl) {
    return "";
  }

  return isVisualProductionAssetType(asset.type) || isImageMediaUrl(mediaUrl) ? mediaUrl : "";
}
