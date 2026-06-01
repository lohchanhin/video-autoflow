import { readJson, writeJson } from "./local-storage.js";

export interface ScheduleRunLock {
  acquiredAt: string;
  expiresAt: string;
  runAt: string;
  scheduleId: string;
}

const storageKey = "ai-content-factory:schedule-run-locks";
const defaultLockTtlMs = 10 * 60 * 1000;

export function tryAcquireScheduleRunLock(input: {
  now?: Date | undefined;
  runAt: string;
  scheduleId: string;
  ttlMs?: number | undefined;
}): boolean {
  const now = input.now ?? new Date();
  const ttlMs = input.ttlMs ?? defaultLockTtlMs;
  const locks = loadActiveLocks(now);
  const existingLock = locks.find((lock) => lock.scheduleId === input.scheduleId && lock.runAt === input.runAt);

  if (existingLock) {
    writeJson(storageKey, locks);
    return false;
  }

  locks.push({
    acquiredAt: now.toISOString(),
    expiresAt: new Date(now.getTime() + ttlMs).toISOString(),
    runAt: input.runAt,
    scheduleId: input.scheduleId
  });
  writeJson(storageKey, locks);
  return true;
}

export function loadActiveScheduleRunLocks(now = new Date()): ScheduleRunLock[] {
  return loadActiveLocks(now);
}

function loadActiveLocks(now: Date): ScheduleRunLock[] {
  return readJson<ScheduleRunLock[]>(storageKey, []).filter((lock) =>
    Boolean(lock.scheduleId && lock.runAt) && new Date(lock.expiresAt).getTime() > now.getTime()
  );
}
