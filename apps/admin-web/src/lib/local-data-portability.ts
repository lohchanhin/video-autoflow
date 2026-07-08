const appStoragePrefix = "ai-content-factory:";
const appName = "ai-content-factory";

export const productionAppOrigin = "https://vertex-workflow.com";

export interface LocalDataEntry {
  key: string;
  value: string;
}

export interface LocalDataSnapshot {
  app: typeof appName;
  entries: LocalDataEntry[];
  exportedAt: string;
  schemaVersion: 1;
  sourceOrigin: string;
}

export interface LocalDataImportResult {
  imported: number;
  skipped: number;
}

export interface LocalDataMigrationMessage {
  snapshot: LocalDataSnapshot;
  type: "ai-content-factory:local-data-migration";
}

export function listFactoryLocalData(storage: Storage | null = getStorage()): LocalDataEntry[] {
  if (!storage) {
    return [];
  }

  const entries: LocalDataEntry[] = [];

  for (let index = 0; index < storage.length; index += 1) {
    const key = storage.key(index);

    if (!key?.startsWith(appStoragePrefix)) {
      continue;
    }

    const value = storage.getItem(key);

    if (value !== null) {
      entries.push({ key, value });
    }
  }

  return entries.sort((left, right) => left.key.localeCompare(right.key));
}

export function createLocalDataSnapshot(sourceOrigin = getOrigin(), storage: Storage | null = getStorage()): LocalDataSnapshot {
  return {
    app: appName,
    entries: listFactoryLocalData(storage),
    exportedAt: new Date().toISOString(),
    schemaVersion: 1,
    sourceOrigin
  };
}

export function getLocalDataStats(storage: Storage | null = getStorage()): { bytes: number; count: number } {
  const entries = listFactoryLocalData(storage);
  const bytes = entries.reduce((total, entry) => total + entry.key.length + entry.value.length, 0);

  return { bytes, count: entries.length };
}

export function importLocalDataSnapshot(snapshot: LocalDataSnapshot, options: { overwrite?: boolean } = {}): LocalDataImportResult {
  const storage = getStorage();

  if (!storage || !isLocalDataSnapshot(snapshot)) {
    return { imported: 0, skipped: snapshot?.entries?.length ?? 0 };
  }

  const overwrite = options.overwrite ?? true;
  let imported = 0;
  let skipped = 0;

  for (const entry of snapshot.entries) {
    if (!entry.key.startsWith(appStoragePrefix)) {
      skipped += 1;
      continue;
    }

    if (!overwrite && storage.getItem(entry.key) !== null) {
      skipped += 1;
      continue;
    }

    storage.setItem(entry.key, entry.value);
    imported += 1;
  }

  return { imported, skipped };
}

export function isLocalDataSnapshot(value: unknown): value is LocalDataSnapshot {
  const snapshot = value as Partial<LocalDataSnapshot> | null;

  return Boolean(
    snapshot &&
      snapshot.app === appName &&
      snapshot.schemaVersion === 1 &&
      typeof snapshot.exportedAt === "string" &&
      typeof snapshot.sourceOrigin === "string" &&
      Array.isArray(snapshot.entries) &&
      snapshot.entries.every((entry) => typeof entry.key === "string" && typeof entry.value === "string")
  );
}

export function isLocalDataMigrationMessage(value: unknown): value is LocalDataMigrationMessage {
  const message = value as Partial<LocalDataMigrationMessage> | null;

  return Boolean(message?.type === "ai-content-factory:local-data-migration" && isLocalDataSnapshot(message.snapshot));
}

export function downloadLocalDataSnapshot(snapshot = createLocalDataSnapshot()): void {
  const blob = new Blob([JSON.stringify(snapshot, null, 2)], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");

  link.href = url;
  link.download = `ai-content-factory-local-data-${new Date().toISOString().slice(0, 10)}.json`;
  document.body.append(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
}

export function sendLocalDataToProductionDomain(snapshot = createLocalDataSnapshot(), targetOrigin = productionAppOrigin): boolean {
  const targetWindow = window.open(`${targetOrigin}/#storage`, "_blank");

  if (!targetWindow) {
    return false;
  }

  const message: LocalDataMigrationMessage = {
    snapshot,
    type: "ai-content-factory:local-data-migration"
  };
  let attempts = 0;
  const timer = window.setInterval(() => {
    attempts += 1;
    targetWindow.postMessage(message, targetOrigin);

    if (attempts >= 24) {
      window.clearInterval(timer);
    }
  }, 500);

  return true;
}

function getOrigin(): string {
  return typeof window === "undefined" ? "unknown" : window.location.origin;
}

function getStorage(): Storage | null {
  return typeof globalThis.localStorage === "undefined" ? null : globalThis.localStorage;
}
