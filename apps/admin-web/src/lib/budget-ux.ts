export function getCaseBudgetRecoveryAmount(actualCostRM: number, currentLimitRM: number): number {
  const actual = normalizeRM(actualCostRM);
  const currentLimit = normalizeRM(currentLimitRM);
  const currentExposure = Math.max(actual, currentLimit, 0.1);
  const buffer = Math.max(5, currentExposure * 0.2);
  const rounded = Math.ceil((currentExposure + buffer) / 5) * 5;

  return Number(rounded.toFixed(2));
}

export type CaseBudgetRescuePlan = {
  headroomRM: number;
  quickLimitsRM: number[];
  shortfallRM: number;
  suggestedLimitRM: number;
  totalExposureRM: number;
};

export function buildCaseBudgetRescuePlan(actualCostRM: number, currentLimitRM: number, nextEstimatedCostRM = 0): CaseBudgetRescuePlan {
  const actual = normalizeRM(actualCostRM);
  const currentLimit = normalizeRM(currentLimitRM);
  const nextEstimate = normalizeRM(nextEstimatedCostRM);
  const totalExposureRM = Number((actual + nextEstimate).toFixed(4));
  const suggestedLimitRM = getCaseBudgetRecoveryAmount(totalExposureRM, currentLimit);
  const quickLimitsRM = buildQuickLimits(suggestedLimitRM, currentLimit);

  return {
    headroomRM: Number(Math.max(0, suggestedLimitRM - totalExposureRM).toFixed(4)),
    quickLimitsRM,
    shortfallRM: Number(Math.max(0, totalExposureRM - currentLimit).toFixed(4)),
    suggestedLimitRM,
    totalExposureRM
  };
}

function normalizeRM(value: number): number {
  return Number.isFinite(value) ? Math.max(0, value) : 0;
}

function buildQuickLimits(suggestedLimitRM: number, currentLimitRM: number): number[] {
  const baseline = Math.max(suggestedLimitRM, currentLimitRM, 0.1);
  const roundedBaseline = Math.ceil(baseline / 5) * 5;
  const candidates = [
    roundedBaseline,
    Math.ceil((roundedBaseline * 1.5) / 5) * 5,
    Math.ceil((roundedBaseline * 2) / 10) * 10,
    100
  ];
  const unique = [...new Set(candidates.map((value) => Number(value.toFixed(2))))];

  return unique.filter((value) => value >= suggestedLimitRM).slice(0, 4);
}
