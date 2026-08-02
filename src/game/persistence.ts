interface StorageProbeTarget {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem(key: string): void;
}

const STORAGE_PROBE_KEY = "darkpix-storage-probe-v1";

export function browserStorageWritable(storage?: StorageProbeTarget): boolean {
  let target: StorageProbeTarget | undefined;
  let previous: string | null | undefined;
  let mutated = false;
  let restored = false;
  try {
    target = storage ?? globalThis.localStorage;
    previous = target.getItem(STORAGE_PROBE_KEY);
    const marker = `writable-${Date.now()}`;
    target.setItem(STORAGE_PROBE_KEY, marker);
    mutated = true;
    const written = target.getItem(STORAGE_PROBE_KEY) === marker;
    if (previous === null) target.removeItem(STORAGE_PROBE_KEY);
    else target.setItem(STORAGE_PROBE_KEY, previous);
    restored = target.getItem(STORAGE_PROBE_KEY) === previous;
    return written && restored;
  } catch {
    return false;
  } finally {
    if (target && mutated && !restored && previous !== undefined) {
      try {
        if (previous === null) target.removeItem(STORAGE_PROBE_KEY);
        else target.setItem(STORAGE_PROBE_KEY, previous);
      } catch {
        // Persistence is already unavailable; the caller will lock risky actions.
      }
    }
  }
}

export function persistBeforeClearingEscrow(persist: () => boolean, clearEscrow: () => boolean): boolean {
  if (!persist()) return false;
  return clearEscrow();
}

export interface JournalRetryState {
  remaining: number;
  due: boolean;
}

export function advanceJournalRetry(secure: boolean, remaining: number, delta: number): JournalRetryState {
  if (secure) return { remaining: 0, due: false };
  const safeRemaining = Number.isFinite(remaining) ? Math.max(0, remaining) : 0;
  const safeDelta = Number.isFinite(delta) ? Math.max(0, delta) : 0;
  const next = Math.max(0, safeRemaining - safeDelta);
  return { remaining: next, due: next === 0 };
}
