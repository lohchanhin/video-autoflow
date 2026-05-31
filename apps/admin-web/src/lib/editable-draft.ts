import { useCallback, useEffect, useMemo, useState } from "react";

export type DraftPatch<T> = Partial<T>;

export function cloneDraft<T>(source: T): T {
  if (typeof globalThis.structuredClone === "function") {
    return globalThis.structuredClone(source);
  }

  return JSON.parse(JSON.stringify(source)) as T;
}

export function areDraftsEqual<T>(left: T, right: T): boolean {
  return stableStringify(left) === stableStringify(right);
}

export function createDraftPatch<T extends object>(source: T, draft: T): Partial<T> {
  const patch: Partial<T> = {};
  const sourceRecord = source as Record<string, unknown>;
  const draftRecord = draft as Record<string, unknown>;
  const keys = new Set([...Object.keys(sourceRecord), ...Object.keys(draftRecord)] as Array<keyof T>);

  keys.forEach((key) => {
    if (!areDraftsEqual(source[key], draft[key])) {
      patch[key] = draft[key];
    }
  });

  return patch;
}

export function useEditableDraft<T extends object>(source: T | null, sourceKey: string | number | null) {
  const [baseline, setBaseline] = useState<T | null>(() => (source ? cloneDraft(source) : null));
  const [draft, setDraft] = useState<T | null>(() => (source ? cloneDraft(source) : null));

  useEffect(() => {
    setBaseline(source ? cloneDraft(source) : null);
    setDraft(source ? cloneDraft(source) : null);
  }, [sourceKey]);

  const isDirty = useMemo(() => Boolean(baseline && draft && !areDraftsEqual(baseline, draft)), [baseline, draft]);

  const setDraftPatch = useCallback((patch: Partial<T>) => {
    setDraft((current) => (current ? { ...current, ...patch } : current));
  }, []);

  const resetDraft = useCallback(() => {
    setDraft(baseline ? cloneDraft(baseline) : null);
  }, [baseline]);

  const markSaved = useCallback((nextSource?: T) => {
    const saved = cloneDraft(nextSource ?? draft);
    setBaseline(saved);
    setDraft(cloneDraft(saved));
  }, [draft]);

  const patch = useMemo(() => (baseline && draft ? createDraftPatch(baseline, draft) : {}), [baseline, draft]);

  return {
    baseline,
    draft,
    isDirty,
    markSaved,
    patch,
    resetDraft,
    setDraft,
    setDraftPatch
  };
}

export function confirmDiscardDirtyDraft(isDirty: boolean, message = "有未保存修改。确定要放弃这些修改吗？"): boolean {
  if (!isDirty) {
    return true;
  }

  if (typeof window === "undefined") {
    return true;
  }

  return window.confirm(message);
}

function stableStringify(value: unknown): string {
  return JSON.stringify(sortForStableStringify(value));
}

function sortForStableStringify(value: unknown): unknown {
  if (Array.isArray(value)) {
    return value.map(sortForStableStringify);
  }

  if (!value || typeof value !== "object") {
    return value;
  }

  return Object.fromEntries(
    Object.entries(value as Record<string, unknown>)
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([key, entryValue]) => [key, sortForStableStringify(entryValue)])
  );
}
