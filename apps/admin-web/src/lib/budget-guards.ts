export interface CaseBudgetGuardJob {
  actualCostRM: number;
  costLimitRM: number;
  id: string;
  topic: string;
}

export interface CaseBudgetGuardResult {
  canRun: boolean;
  message: string;
  remainingRM: number;
  usagePct: number;
}

export function evaluateCaseBudgetGuard(
  job: CaseBudgetGuardJob,
  input: { estimatedCostRM?: number | undefined; operationLabel: string }
): CaseBudgetGuardResult {
  const actualCostRM = roundRM(Math.max(0, Number(job.actualCostRM) || 0));
  const costLimitRM = roundRM(Math.max(0, Number(job.costLimitRM) || 0));
  const remainingRM = roundRM(Math.max(0, costLimitRM - actualCostRM));
  const usagePct = costLimitRM > 0 ? Math.min(999, Math.round((actualCostRM / costLimitRM) * 100)) : 999;
  const estimatedCostRM = typeof input.estimatedCostRM === "number" ? Math.max(0, input.estimatedCostRM) : null;

  if (costLimitRM <= 0) {
    return {
      canRun: false,
      message: `${formatOperationLabel(input.operationLabel)} 已被预算护栏停止：当前 Case 没有有效预算上限。请在本 Case「总览 > 预算」输入预算并点击保存；以后新 Case 的默认预算到左侧「成本」页面调整。`,
      remainingRM,
      usagePct
    };
  }

  if (actualCostRM >= costLimitRM) {
    return {
      canRun: false,
      message: `${formatOperationLabel(input.operationLabel)} 已被预算护栏停止：当前 Case 已花费 RM ${actualCostRM.toFixed(4)} / 上限 RM ${costLimitRM.toFixed(2)}。请在本 Case「总览 > 预算」调高并保存后继续；左侧「成本」只会调整之后新建 Case 的默认预算。`,
      remainingRM,
      usagePct
    };
  }

  if (estimatedCostRM !== null && estimatedCostRM > remainingRM) {
    return {
      canRun: false,
      message: `${formatOperationLabel(input.operationLabel)} 已被预算护栏停止：下一步预计 RM ${estimatedCostRM.toFixed(4)}，但当前 Case 剩余预算只有 RM ${remainingRM.toFixed(4)}。请在本 Case「总览 > 预算」调高并保存，或改用更低成本工具后再执行。`,
      remainingRM,
      usagePct
    };
  }

  return {
    canRun: true,
    message: "",
    remainingRM,
    usagePct
  };
}

function roundRM(value: number): number {
  return Math.round(value * 10_000) / 10_000;
}

function formatOperationLabel(operationLabel: string): string {
  const labels: Record<string, string> = {
    "Autopilot image generation": "自动生成图片",
    "Autopilot MP4 composition": "自动合成 MP4",
    "Autopilot voiceover generation": "自动生成配音",
    "Background music generation": "生成背景音乐",
    "Final MP4 generation": "生成完整 MP4",
    "Generate full MP4": "生成完整 MP4",
    "Generate images": "生成图片",
    "Generate script": "生成脚本",
    "Generate Seedance clips": "生成 Seedance 影片片段",
    "Image generation": "生成图片",
    "Production asset generation": "生成设计资产",
    "Script/story generation": "生成脚本/分镜",
    "Seedance video clip generation": "生成 Seedance 影片片段",
    "Voiceover generation": "生成配音"
  };

  return labels[operationLabel] ?? operationLabel;
}
