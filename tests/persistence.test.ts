import { describe, expect, it, vi } from "vitest";
import { persistBeforeClearingEscrow } from "../src/game/persistence";

describe("raid verdict persistence ordering", () => {
  it("clears escrow only after the completed verdict is durable", () => {
    const order: string[] = [];
    const persisted = persistBeforeClearingEscrow(
      () => { order.push("persist"); return true; },
      () => { order.push("clear"); },
    );
    expect(persisted).toBe(true);
    expect(order).toEqual(["persist", "clear"]);
  });

  it("retains escrow when verdict persistence fails", () => {
    const clear = vi.fn();
    expect(persistBeforeClearingEscrow(() => false, clear)).toBe(false);
    expect(clear).not.toHaveBeenCalled();
  });
});
