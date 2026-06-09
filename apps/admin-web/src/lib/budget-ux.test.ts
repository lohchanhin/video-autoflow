import { describe, expect, it } from "vitest";
import { getCaseBudgetRecoveryAmount } from "./budget-ux.js";

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
});
