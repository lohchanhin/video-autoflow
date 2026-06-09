import { describe, expect, it } from "vitest";
import { evaluateCaseBudgetGuard } from "./budget-guards.js";

describe("case budget guards", () => {
  it("allows generation while the case has remaining budget", () => {
    const guard = evaluateCaseBudgetGuard(createJob({ actualCostRM: 1.25, costLimitRM: 7.5 }), {
      operationLabel: "Generate images"
    });

    expect(guard.canRun).toBe(true);
    expect(guard.remainingRM).toBe(6.25);
    expect(guard.usagePct).toBe(17);
  });

  it("blocks case operations after budget is exhausted", () => {
    const guard = evaluateCaseBudgetGuard(createJob({ actualCostRM: 7.5, costLimitRM: 7.5 }), {
      operationLabel: "Generate Seedance clips"
    });

    expect(guard.canRun).toBe(false);
    expect(guard.message).toContain("生成 Seedance 影片片段");
    expect(guard.message).toContain("已被预算护栏停止");
    expect(guard.message).toContain("总览 > 预算");
  });

  it("blocks when an estimated next step exceeds remaining budget", () => {
    const guard = evaluateCaseBudgetGuard(createJob({ actualCostRM: 7, costLimitRM: 7.5 }), {
      estimatedCostRM: 1.2,
      operationLabel: "Generate full MP4"
    });

    expect(guard.canRun).toBe(false);
    expect(guard.message).toContain("下一步预计");
    expect(guard.message).toContain("改用更低成本工具");
  });

  it("blocks invalid zero budgets", () => {
    const guard = evaluateCaseBudgetGuard(createJob({ actualCostRM: 0, costLimitRM: 0 }), {
      operationLabel: "Generate script"
    });

    expect(guard.canRun).toBe(false);
    expect(guard.message).toContain("没有有效预算上限");
    expect(guard.message).toContain("成本");
  });
});

function createJob(overrides: { actualCostRM: number; costLimitRM: number }) {
  return {
    id: "job_budget",
    topic: "Budget case",
    ...overrides
  };
}
