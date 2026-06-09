import { syncLocalStateKey } from "./app-state-sync.js";

export function readJson<T>(key: string, fallback: T): T {
  const storage = getLocalStorage();

  if (!storage) {
    return fallback;
  }

  const raw = storage.getItem(key);

  if (!raw) {
    storage.setItem(key, JSON.stringify(fallback));
    return fallback;
  }

  try {
    return JSON.parse(raw) as T;
  } catch {
    storage.setItem(key, JSON.stringify(fallback));
    return fallback;
  }
}

export function writeJson<T>(key: string, value: T): void {
  const storage = getLocalStorage();

  if (!storage) {
    return;
  }

  const serialized = JSON.stringify(value);
  storage.setItem(key, serialized);
  syncLocalStateKey(key, serialized);
}

function getLocalStorage(): Storage | null {
  if (typeof globalThis.localStorage === "undefined") {
    return null;
  }

  return globalThis.localStorage;
}
