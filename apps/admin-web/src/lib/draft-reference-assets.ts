import type { ProductionAsset } from "@ai-content-factory/shared-types";
import { resolveProductionAssetPreviewUrl } from "./production-asset-media.js";

export function isSelectableDraftReferenceAsset(asset: ProductionAsset): boolean {
  const previewUrl = resolveProductionAssetPreviewUrl(asset);

  return Boolean(previewUrl) && (asset.status === "approved" || asset.status === "ready");
}

export function isReusableDraftReferenceAsset(asset: ProductionAsset): boolean {
  return !asset.jobId || asset.jobId === "asset_library";
}

export function shouldHideFromNewCaseReferencePicker(asset: ProductionAsset): boolean {
  if (asset.type !== "character_design" && asset.type !== "scene_design" && asset.type !== "style_reference") {
    return false;
  }

  return !isSelectableDraftReferenceAsset(asset) || !isReusableDraftReferenceAsset(asset);
}
