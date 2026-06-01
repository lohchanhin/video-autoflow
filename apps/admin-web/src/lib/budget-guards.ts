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
      message: `${input.operationLabel} blocked: this Case has no valid budget limit configured.`,
      remainingRM,
      usagePct
    };
  }

  if (actualCostRM >= costLimitRM) {
    return {
      canRun: false,
      message: `${input.operationLabel} blocked: Case budget exhausted. Current RM ${actualCostRM.toFixed(4)} / limit RM ${costLimitRM.toFixed(2)}.`,
      remainingRM,
      usagePct
    };
  }

  if (estimatedCostRM !== null && estimatedCostRM > remainingRM) {
    return {
      canRun: false,
      message: `${input.operationLabel} blocked: estimated next cost RM ${estimatedCostRM.toFixed(4)} exceeds remaining budget RM ${remainingRM.toFixed(4)}.`,
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
