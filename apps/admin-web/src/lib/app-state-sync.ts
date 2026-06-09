import type { AppStateSnapshotResponse } from "@ai-content-factory/shared-types";

const appStatePrefix = "ai-content-factory:";
const syncDebounceMs = 350;
const syncTimers = new Map<string, number>();

export async function hydrateLocalStateFromServer(): Promise<void> {
  const storage = getLocalStorage();

  if (!storage || !canUseRemoteState()) {
    return;
  }

  const localEntries = listLocalStateEntries(storage);

  try {
    const response = await fetch(`${getApiBaseUrl()}/app-state?prefix=${encodeURIComponent(appStatePrefix)}`);

    if (!response.ok) {
      return;
    }

    const snapshot = (await response.json()) as AppStateSnapshotResponse;

    if (snapshot.entries.length > 0) {
      snapshot.entries.forEach((entry) => storage.setItem(entry.key, entry.value));
      return;
    }

    if (localEntries.length > 0) {
      await uploadLocalStateSnapshot(localEntries);
    }
  } catch {
    // Local development must still open when the API is offline.
  }
}

export function syncLocalStateKey(key: string, value: string): void {
  if (!isAppStateKey(key) || !canUseRemoteState()) {
    return;
  }

  const existingTimer = syncTimers.get(key);

  if (existingTimer !== undefined) {
    window.clearTimeout(existingTimer);
  }

  const timer = window.setTimeout(() => {
    syncTimers.delete(key);
    void putAppStateKey(key, value);
  }, syncDebounceMs);

  syncTimers.set(key, timer);
}

async function putAppStateKey(key: string, value: string): Promise<void> {
  try {
    await fetch(`${getApiBaseUrl()}/app-state/${encodeURIComponent(key)}`, {
      body: JSON.stringify({ value }),
      headers: {
        "Content-Type": "application/json"
      },
      method: "PUT"
    });
  } catch {
    // Keep the UI responsive. The next explicit save will retry.
  }
}

async function uploadLocalStateSnapshot(entries: Array<{ key: string; value: string }>): Promise<void> {
  await fetch(`${getApiBaseUrl()}/app-state/snapshot`, {
    body: JSON.stringify({ entries }),
    headers: {
      "Content-Type": "application/json"
    },
    method: "POST"
  });
}

function listLocalStateEntries(storage: Storage): Array<{ key: string; value: string }> {
  const entries: Array<{ key: string; value: string }> = [];

  for (let index = 0; index < storage.length; index += 1) {
    const key = storage.key(index);

    if (!key || !isAppStateKey(key)) {
      continue;
    }

    const value = storage.getItem(key);

    if (value !== null) {
      entries.push({ key, value });
    }
  }

  return entries;
}

function canUseRemoteState(): boolean {
  return typeof window !== "undefined" && typeof fetch !== "undefined";
}

function getApiBaseUrl(): string {
  const hostname = window.location.hostname;

  if (hostname && hostname !== "127.0.0.1" && hostname !== "localhost") {
    if (isIpAddress(hostname)) {
      return `${window.location.protocol}//${hostname}:4000`;
    }

    return `${window.location.origin}/api`;
  }

  return "http://127.0.0.1:4000";
}

function isAppStateKey(key: string): boolean {
  return key.startsWith(appStatePrefix);
}

function isIpAddress(hostname: string): boolean {
  return /^\d{1,3}(?:\.\d{1,3}){3}$/u.test(hostname) || hostname.includes(":");
}

function getLocalStorage(): Storage | null {
  if (typeof globalThis.localStorage === "undefined") {
    return null;
  }

  return globalThis.localStorage;
}
