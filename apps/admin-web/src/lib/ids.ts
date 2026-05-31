export function createId(prefix: string): string {
  const cryptoApi = globalThis.crypto as (Crypto & { randomUUID?: () => string }) | undefined;
  const randomUuid = typeof cryptoApi?.randomUUID === "function" ? cryptoApi.randomUUID() : undefined;

  if (randomUuid) {
    return `${prefix}_${randomUuid.slice(0, 8)}`;
  }

  if (cryptoApi) {
    const randomValues = new Uint32Array(2);
    cryptoApi.getRandomValues(randomValues);
    return `${prefix}_${Array.from(randomValues, (value) => value.toString(16).padStart(8, "0")).join("").slice(0, 8)}`;
  }

  return `${prefix}_${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;
}
