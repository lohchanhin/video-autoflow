import { describe, expect, it, vi } from "vitest";
import { areDraftsEqual, confirmDiscardDirtyDraft, countDirtyDrafts, createDraftPatch, updateDirtyDraftMap } from "./editable-draft.js";

describe("editable draft helpers", () => {
  it("detects equal objects even when key order differs", () => {
    expect(areDraftsEqual({ a: 1, b: { c: 2 } }, { b: { c: 2 }, a: 1 })).toBe(true);
  });

  it("creates a top-level patch with only changed fields", () => {
    const source = { count: 1, name: "old", tags: ["a"] };
    const draft = { count: 1, name: "new", tags: ["a", "b"] };

    expect(createDraftPatch(source, draft)).toEqual({
      name: "new",
      tags: ["a", "b"]
    });
  });

  it("does not prompt when there are no dirty changes", () => {
    expect(confirmDiscardDirtyDraft(false)).toBe(true);
  });

  it("tracks dirty draft keys without preserving false entries", () => {
    const first = updateDirtyDraftMap({}, "asset:1", true);
    const second = updateDirtyDraftMap(first, "case:1", true);
    const third = updateDirtyDraftMap(second, "asset:1", false);

    expect(first).toEqual({ "asset:1": true });
    expect(second).toEqual({ "asset:1": true, "case:1": true });
    expect(third).toEqual({ "case:1": true });
    expect(countDirtyDrafts(third)).toBe(1);
  });

  it("uses browser confirm when dirty", () => {
    const confirmSpy = vi.fn(() => false);
    vi.stubGlobal("window", { confirm: confirmSpy });

    expect(confirmDiscardDirtyDraft(true)).toBe(false);
    expect(confirmSpy).toHaveBeenCalled();

    vi.unstubAllGlobals();
  });
});
