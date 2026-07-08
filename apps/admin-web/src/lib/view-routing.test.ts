import { describe, expect, it } from "vitest";
import { resolveViewFromHash } from "./view-routing.js";

describe("view hash routing", () => {
  it("routes current page hashes directly", () => {
    expect(resolveViewFromHash("#agents")).toEqual({ canonicalHash: null, view: "agents" });
    expect(resolveViewFromHash("#workflow")).toEqual({ canonicalHash: null, view: "workflow" });
  });

  it("normalizes historical and natural aliases", () => {
    expect(resolveViewFromHash("#jobs")).toEqual({ canonicalHash: "#cases", view: "cases" });
    expect(resolveViewFromHash("#characters")).toEqual({ canonicalHash: "#assets", view: "assets" });
    expect(resolveViewFromHash("#agent")).toEqual({ canonicalHash: "#agents", view: "agents" });
  });

  it("falls back unknown hashes to dashboard without rewriting the URL", () => {
    expect(resolveViewFromHash("#missing")).toEqual({ canonicalHash: null, view: "dashboard" });
  });
});
