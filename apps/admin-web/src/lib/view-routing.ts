export const activeViews = [
  "dashboard",
  "automation",
  "trends",
  "series",
  "cases",
  "assets",
  "agents",
  "workflow",
  "keys",
  "youtube",
  "storage",
  "cost"
] as const;

export type ActiveView = typeof activeViews[number];

const activeViewSet = new Set<string>(activeViews);
const hashAliases: Record<string, ActiveView> = {
  agent: "agents",
  characters: "assets",
  jobs: "cases"
};

export interface ResolvedViewHash {
  canonicalHash: string | null;
  view: ActiveView;
}

export function resolveViewFromHash(hashValue: string): ResolvedViewHash {
  const hash = hashValue.trim().replace(/^#/, "");
  const aliasedView = hashAliases[hash];

  if (aliasedView) {
    return { canonicalHash: `#${aliasedView}`, view: aliasedView };
  }

  if (activeViewSet.has(hash)) {
    return { canonicalHash: null, view: hash as ActiveView };
  }

  return { canonicalHash: null, view: "dashboard" };
}
