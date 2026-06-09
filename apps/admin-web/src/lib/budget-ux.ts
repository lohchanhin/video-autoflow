export function getCaseBudgetRecoveryAmount(actualCostRM: number, currentLimitRM: number): number {
  const actual = normalizeRM(actualCostRM);
  const currentLimit = normalizeRM(currentLimitRM);
  const currentExposure = Math.max(actual, currentLimit, 0.1);
  const buffer = Math.max(5, currentExposure * 0.2);
  const rounded = Math.ceil((currentExposure + buffer) / 5) * 5;

  return Number(rounded.toFixed(2));
}

function normalizeRM(value: number): number {
  return Number.isFinite(value) ? Math.max(0, value) : 0;
}
