import type { ProductionAsset, ProductionAssetRole, ProductionAssetType } from "@ai-content-factory/shared-types";
import { resolveFirstMediaUrl } from "./media-url.js";

export type ProductionAssetReadinessState = "usable" | "needs_review" | "needs_generation" | "needs_routing" | "blocked";

export interface ProductionAssetReadiness {
  blockers: string[];
  canUseAsReference: boolean;
  label: string;
  nextAction: string;
  state: ProductionAssetReadinessState;
  tone: "danger" | "neutral" | "success" | "warning";
  warnings: string[];
}

export function evaluateProductionAssetReadiness(asset: ProductionAsset): ProductionAssetReadiness {
  const blockers: string[] = [];
  const warnings: string[] = [];
  const expectedRole = getExpectedAssetRole(asset.type);
  const hasUrl = Boolean(resolveFirstMediaUrl([asset.url, asset.storagePath]));
  const hasPrompt = Boolean(asset.prompt.trim());

  if (!hasPrompt && asset.type !== "bgm_reference") {
    warnings.push("缺少设计 prompt，后续很难追溯资产生成依据。");
  }

  if (asset.status === "failed") {
    blockers.push(asset.error || "资产生成失败。");
    return buildReadiness("blocked", blockers, warnings, "失败", "修复错误后重新生成或删除这条资产。");
  }

  if (asset.status === "rejected") {
    blockers.push("资产已被标记为不采用。");
    return buildReadiness("blocked", blockers, warnings, "不采用", "复制为新版本或重新生成。");
  }

  if (asset.status === "generating") {
    return buildReadiness("needs_generation", blockers, warnings, "生成中", "等待生成完成后再审核。");
  }

  if (!hasUrl) {
    blockers.push("缺少图片或音频 URL，无法传给下游模型。");
    return buildReadiness("needs_generation", blockers, warnings, "待生成", "先生成可预览的资产。");
  }

  if (asset.role === "none") {
    blockers.push("Seedance 用途为“不传给模型”，下游不会使用这条资产。");
    return buildReadiness("needs_routing", blockers, warnings, "未路由", "选择正确的下游用途后保存。");
  }

  if (asset.role !== expectedRole) {
    blockers.push(`当前用途是「${formatAssetRole(asset.role)}」，建议改为「${formatAssetRole(expectedRole)}」。`);
    return buildReadiness("needs_routing", blockers, warnings, "用途不匹配", "修正 Seedance 用途后保存。");
  }

  if (asset.status === "ready") {
    warnings.push("资产已生成但还未批准入库；可用于测试，但量产前建议先审核批准。");
    return buildReadiness("needs_review", blockers, warnings, "待审核", "检查画面是否符合规格，满意后保存入库。", true);
  }

  if (asset.status === "approved") {
    return buildReadiness("usable", blockers, warnings, "可复用", "可以作为后续图片、影片或音乐生成参考。", true);
  }

  return buildReadiness("needs_generation", blockers, warnings, "规划中", "生成资产并审核后才可复用。");
}

export function getExpectedAssetRole(type: ProductionAssetType): ProductionAssetRole {
  if (type === "first_frame") return "first_frame";
  if (type === "last_frame") return "last_frame";
  if (type === "bgm_reference") return "bgm_reference";
  return "reference_image";
}

function buildReadiness(
  state: ProductionAssetReadinessState,
  blockers: string[],
  warnings: string[],
  label: string,
  nextAction: string,
  canUseAsReference = false
): ProductionAssetReadiness {
  return {
    blockers,
    canUseAsReference,
    label,
    nextAction,
    state,
    tone: getReadinessTone(state),
    warnings
  };
}

function getReadinessTone(state: ProductionAssetReadinessState): ProductionAssetReadiness["tone"] {
  if (state === "usable") return "success";
  if (state === "blocked") return "danger";
  if (state === "needs_review" || state === "needs_routing") return "warning";
  return "neutral";
}

function formatAssetRole(role: ProductionAssetRole): string {
  const labels: Record<ProductionAssetRole, string> = {
    bgm_reference: "BGM参考",
    first_frame: "首帧",
    last_frame: "尾帧",
    none: "不传给模型",
    reference_image: "参考图"
  };

  return labels[role];
}
