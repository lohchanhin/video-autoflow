import type { ToolProviderSettings, ToolProviderType } from "./admin-data.js";
import type { AdminJob, JobProcessRecord } from "./jobs.js";

export type CaseNextCostStage = "script" | "image" | "tts" | "compose" | "qc" | "review";

export type CaseNextCostPricingStatus = "priced" | "free" | "missing_tool" | "disabled" | "missing_price" | "not_applicable";

export interface CaseNextCostEstimate {
  detail: string;
  estimatedCostRM: number | null;
  exceedsBudget: boolean;
  label: string;
  pricingStatus: CaseNextCostPricingStatus;
  remainingRM: number;
  stage: CaseNextCostStage;
  toolType: ToolProviderType | null;
}

export interface CaseCostReadiness {
  finalMp4Ready: boolean;
  imageReadyForCompose: boolean;
  scriptStoryReady: boolean;
  voiceoverReadyForCompose: boolean;
}

export function estimateNextCaseCost(input: {
  job: AdminJob;
  readiness: CaseCostReadiness;
  records: JobProcessRecord[];
  settings: ToolProviderSettings[];
}): CaseNextCostEstimate {
  const remainingRM = roundRM(Math.max(0, input.job.costLimitRM - input.job.actualCostRM));
  const nextStage = resolveNextCostStage(input.job, input.readiness);
  const toolType = nextStage.toolType;

  if (toolType === null) {
    return {
      detail: nextStage.detail,
      estimatedCostRM: 0,
      exceedsBudget: false,
      label: nextStage.label,
      pricingStatus: "not_applicable",
      remainingRM,
      stage: nextStage.stage,
      toolType: null
    };
  }

  const setting = findPreferredToolSetting(input.settings, toolType);
  if (!setting) {
    return createSetupEstimate({ ...nextStage, toolType }, remainingRM, "missing_tool", "缺少工具设置，无法估算成本。");
  }

  if (!setting.enabled) {
    return createSetupEstimate({ ...nextStage, toolType }, remainingRM, "disabled", `${setting.provider} / ${setting.model || "未选择模型"} 已停用。`);
  }

  const quantities = estimateToolQuantities(nextStage.stage, input.job, input.records);
  const estimate = estimateConfiguredToolCost(setting, quantities);
  const toolLabel = `${setting.provider}${setting.model ? ` / ${setting.model}` : ""}`;

  if (estimate.status === "missing_price") {
    return {
      detail: `${toolLabel} 尚未在工具设置里填写单价或保底成本。`,
      estimatedCostRM: null,
      exceedsBudget: false,
      label: nextStage.label,
      pricingStatus: "missing_price",
      remainingRM,
      stage: nextStage.stage,
      toolType
    };
  }

  const estimatedCostRM = roundRM(estimate.costRM);

  return {
    detail: `${toolLabel}，${nextStage.detail}。${estimate.detail}`,
    estimatedCostRM,
    exceedsBudget: estimatedCostRM > remainingRM,
    label: nextStage.label,
    pricingStatus: estimatedCostRM === 0 ? "free" : "priced",
    remainingRM,
    stage: nextStage.stage,
    toolType
  };
}

function resolveNextCostStage(job: AdminJob, readiness: CaseCostReadiness): {
  detail: string;
  label: string;
  stage: CaseNextCostStage;
  toolType: ToolProviderType | null;
} {
  if (!readiness.scriptStoryReady) {
    return {
      detail: "按主题生成标题、脚本、分镜和图片提示词",
      label: "脚本 / 分镜",
      stage: "script",
      toolType: "llm"
    };
  }

  if (!readiness.imageReadyForCompose) {
    return {
      detail: `生成 ${Math.max(1, job.sceneCount)} 张场景图片`,
      label: "场景图片",
      stage: "image",
      toolType: "image"
    };
  }

  if (!readiness.voiceoverReadyForCompose) {
    return {
      detail: "生成旁白音频",
      label: "配音",
      stage: "tts",
      toolType: "tts"
    };
  }

  if (!readiness.finalMp4Ready) {
    return {
      detail: `合成约 ${Math.max(1, job.durationSeconds)} 秒 MP4`,
      label: "MP4 合成",
      stage: "compose",
      toolType: "compose"
    };
  }

  if (job.status !== "QC_PASSED" && job.status !== "READY_TO_UPLOAD") {
    return {
      detail: "检查最终影片、音轨、字幕和预算",
      label: "QC 检查",
      stage: "qc",
      toolType: "compose"
    };
  }

  return {
    detail: "已到人工审核或发布闸口，没有自动付费步骤。",
    label: "人工审核",
    stage: "review",
    toolType: null
  };
}

function findPreferredToolSetting(settings: ToolProviderSettings[], toolType: ToolProviderType): ToolProviderSettings | undefined {
  return settings.find((setting) => setting.toolType === toolType && setting.enabled) ?? settings.find((setting) => setting.toolType === toolType);
}

function createSetupEstimate(
  nextStage: { detail: string; label: string; stage: CaseNextCostStage; toolType: ToolProviderType },
  remainingRM: number,
  pricingStatus: "missing_tool" | "disabled",
  detail: string
): CaseNextCostEstimate {
  return {
    detail,
    estimatedCostRM: null,
    exceedsBudget: false,
    label: nextStage.label,
    pricingStatus,
    remainingRM,
    stage: nextStage.stage,
    toolType: nextStage.toolType
  };
}

function estimateToolQuantities(stage: CaseNextCostStage, job: AdminJob, records: JobProcessRecord[]): { inputUnits: number; outputUnits: number; unitLabel: string } {
  if (stage === "script") {
    const inputUnits = estimateTokens([job.topic, job.prompt, job.genre].filter(Boolean).join("\n"));
    const outputUnits = 900 + Math.max(1, job.sceneCount) * 180;
    return {
      inputUnits,
      outputUnits,
      unitLabel: "tokens"
    };
  }

  if (stage === "image") {
    return {
      inputUnits: 0,
      outputUnits: Math.max(1, job.sceneCount),
      unitLabel: "images"
    };
  }

  if (stage === "tts") {
    return {
      inputUnits: 0,
      outputUnits: estimateVoiceoverCharacters(job, records),
      unitLabel: "characters"
    };
  }

  return {
    inputUnits: 0,
    outputUnits: Math.max(1, job.durationSeconds),
    unitLabel: "seconds"
  };
}

function estimateConfiguredToolCost(
  setting: ToolProviderSettings,
  quantities: { inputUnits: number; outputUnits: number; unitLabel: string }
): { costRM: number; detail: string; status: "priced" | "missing_price" } {
  if (setting.costMode === "free") {
    return {
      costRM: 0,
      detail: "工具成本模式为免费。",
      status: "priced"
    };
  }

  const unitCostRM = quantities.inputUnits * setting.inputUnitPriceRM + quantities.outputUnits * setting.outputUnitPriceRM;
  if (unitCostRM > 0) {
    return {
      costRM: unitCostRM,
      detail: `按 ${quantities.outputUnits} ${quantities.unitLabel} 估算。`,
      status: "priced"
    };
  }

  if (setting.fallbackCostRM > 0) {
    return {
      costRM: setting.fallbackCostRM,
      detail: "使用工具设置里的保底成本估算。",
      status: "priced"
    };
  }

  return {
    costRM: 0,
    detail: "",
    status: "missing_price"
  };
}

function estimateTokens(text: string): number {
  return Math.max(200, Math.ceil(text.trim().length / 2));
}

function estimateVoiceoverCharacters(job: AdminJob, records: JobProcessRecord[]): number {
  const scriptRecord = records.find((record) => record.stageId === "script");
  const storyboardRecord = records.find((record) => record.stageId === "storyboard");
  const sourceText = [scriptRecord?.output, storyboardRecord?.output, job.prompt].filter(Boolean).join("\n");
  return Math.max(180, Math.min(1_200, sourceText.trim().length || Math.round(job.durationSeconds * 6)));
}

function roundRM(value: number): number {
  return Math.round(value * 10_000) / 10_000;
}
