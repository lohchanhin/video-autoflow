import type { ProductionAsset } from "@ai-content-factory/shared-types";

export interface ProductionAssetCreateDraft {
  costRM?: number | undefined;
  error?: string | undefined;
  folderName?: string | undefined;
  jobId: string;
  label: string;
  notes?: string | undefined;
  prompt?: string | undefined;
  provider?: ProductionAsset["provider"] | undefined;
  role?: ProductionAsset["role"] | undefined;
  sceneId?: number | null | undefined;
  scope?: ProductionAsset["scope"] | undefined;
  status?: ProductionAsset["status"] | undefined;
  storagePath?: string | undefined;
  tags?: string[] | undefined;
  type: ProductionAsset["type"];
  url?: string | undefined;
}

export function buildProductionAssetVersionDraft(asset: ProductionAsset, now = new Date()): ProductionAssetCreateDraft {
  const versionLabel = `${asset.label} - new version ${formatVersionStamp(now)}`;
  const versionTags = Array.from(new Set([...asset.tags, "version"]));

  return {
    costRM: 0,
    error: "",
    folderName: asset.folderName,
    jobId: asset.jobId,
    label: versionLabel,
    notes: `Version draft forked from ${asset._id}. Original image is preserved; generate this draft before approving it into the reusable library.`,
    prompt: asset.prompt,
    provider: asset.provider,
    role: asset.role,
    sceneId: asset.sceneId,
    scope: asset.scope,
    status: "planned",
    storagePath: "",
    tags: versionTags,
    type: asset.type,
    url: ""
  };
}

function formatVersionStamp(now: Date): string {
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, "0");
  const day = String(now.getDate()).padStart(2, "0");
  const hour = String(now.getHours()).padStart(2, "0");
  const minute = String(now.getMinutes()).padStart(2, "0");

  return `${year}${month}${day}-${hour}${minute}`;
}
