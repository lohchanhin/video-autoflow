import { describe, expect, it } from "vitest";
import { buildCaseBudgetRescuePlan, getCaseBudgetRecoveryAmount } from "./budget-ux.js";

describe("budget UX helpers", () => {
  it("suggests a clean higher case budget when the case is already over limit", () => {
    expect(getCaseBudgetRecoveryAmount(22.1729, 7.5)).toBe(30);
  });

  it("keeps enough headroom above the existing limit when actual cost is lower", () => {
    expect(getCaseBudgetRecoveryAmount(3, 25)).toBe(30);
  });

  it("normalizes invalid amounts into a usable minimum suggestion", () => {
    expect(getCaseBudgetRecoveryAmount(Number.NaN, 0)).toBe(10);
  });

  it("builds a rescue plan with current exposure, shortfall, and quick limits", () => {
    expect(buildCaseBudgetRescuePlan(22.1729, 7.5)).toEqual({
      headroomRM: 7.8271,
      quickLimitsRM: [30, 45, 60, 100],
      shortfallRM: 14.6729,
      suggestedLimitRM: 30,
      totalExposureRM: 22.1729
    });
  });

  it("includes the next estimated paid step before recommending a new case budget", () => {
    const plan = buildCaseBudgetRescuePlan(20, 25, 12);

    expect(plan.totalExposureRM).toBe(32);
    expect(plan.shortfallRM).toBe(7);
    expect(plan.suggestedLimitRM).toBe(40);
    expect(plan.quickLimitsRM[0]).toBe(40);
  });
});
