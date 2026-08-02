import { describe, expect, it, vi } from "vitest";
import { advanceJournalRetry, browserStorageWritable, persistBeforeClearingEscrow } from "../src/game/persistence";

function memoryStorage(options: { rejectWrites?: boolean } = {}) {
  const values = new Map<string, string>();
  return {
    values,
    storage: {
      getItem: (key: string) => values.get(key) ?? null,
      setItem: (key: string, value: string) => {
        if (options.rejectWrites) throw new Error("storage rejected write");
        values.set(key, value);
      },
      removeItem: (key: string) => values.delete(key),
    },
  };
}

describe("browser persistence readiness", () => {
  it("proves a round-trip write without leaving probe data behind", () => {
    const memory = memoryStorage();
    expect(browserStorageWritable(memory.storage)).toBe(true);
    expect(memory.values.size).toBe(0);
  });

  it("fails closed when the browser rejects new writes", () => {
    expect(browserStorageWritable(memoryStorage({ rejectWrites: true }).storage)).toBe(false);
  });
});

describe("raid verdict persistence ordering", () => {
  it("clears escrow only after the completed verdict is durable", () => {
    const order: string[] = [];
    const persisted = persistBeforeClearingEscrow(
      () => { order.push("persist"); return true; },
      () => { order.push("clear"); return true; },
    );
    expect(persisted).toBe(true);
    expect(order).toEqual(["persist", "clear"]);
  });

  it("retains escrow when verdict persistence fails", () => {
    const clear = vi.fn();
    expect(persistBeforeClearingEscrow(() => false, clear)).toBe(false);
    expect(clear).not.toHaveBeenCalled();
  });

  it("reports an unsecured verdict when escrow removal cannot be verified", () => {
    expect(persistBeforeClearingEscrow(() => true, () => false)).toBe(false);
  });
});

describe("live raid journal retry", () => {
  it("retries a failed checkpoint on a bounded simulation-time cadence", () => {
    expect(advanceJournalRetry(true, 3, 1)).toEqual({ remaining: 0, due: false });
    expect(advanceJournalRetry(false, 3, 1)).toEqual({ remaining: 2, due: false });
    expect(advanceJournalRetry(false, 0.2, 0.2)).toEqual({ remaining: 0, due: true });
    expect(advanceJournalRetry(false, Number.NaN, 0.1)).toEqual({ remaining: 0, due: true });
    expect(advanceJournalRetry(false, 2, -4)).toEqual({ remaining: 2, due: false });
  });
});
