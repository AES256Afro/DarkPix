import { describe, expect, it } from "vitest";
import { consumablesInUseOrder, nextConsumableId, nextThrowableId, resolveConsumableId, resolveThrowableId, summarizeQuickslot, throwablesInUseOrder } from "../src/game/quickslots";
import type { Item } from "../src/game/types";

const recovered: Item[] = [
  { id: "root", name: "Smoked root", kind: "consumable", rarity: "Common", power: 0, value: 9 },
  { id: "relic", name: "Old idol", kind: "treasure", rarity: "Rare", power: 0, value: 70 },
];
const packed: Item[] = [
  { id: "ember", name: "Camp ember", kind: "consumable", rarity: "Common", power: 0, value: 12 },
];

describe("raid consumable quick slot", () => {
  it("offers recovered remedies before packed remedies without mutating either source", () => {
    const items = consumablesInUseOrder(recovered, packed);
    expect(items.map((item) => item.id)).toEqual(["root", "ember"]);
    expect(recovered.map((item) => item.id)).toEqual(["root", "relic"]);
    expect(packed.map((item) => item.id)).toEqual(["ember"]);
  });

  it("preserves a valid selection and repairs a stale selection", () => {
    const items = consumablesInUseOrder(recovered, packed);
    expect(resolveConsumableId(items, "ember")).toBe("ember");
    expect(resolveConsumableId(items, "spent")).toBe("root");
    expect(resolveConsumableId([], "spent")).toBeUndefined();
  });

  it("cycles from the default, advances, and wraps", () => {
    const items = consumablesInUseOrder(recovered, packed);
    expect(nextConsumableId(items, undefined)).toBe("root");
    expect(nextConsumableId(items, "root")).toBe("ember");
    expect(nextConsumableId(items, "ember")).toBe("root");
    expect(nextConsumableId([], "root")).toBeUndefined();
  });

  it("summarizes a selected remedy into caller-owned HUD state", () => {
    const target = { count: 99 };
    expect(summarizeQuickslot(recovered, packed, "consumable", "ember", target)).toBe(target);
    expect(target).toEqual({ count: 2, selected: packed[0] });
    expect(summarizeQuickslot(recovered, packed, "consumable", "spent", target)).toEqual({ count: 2, selected: recovered[0] });
  });
});

describe("raid throwable quick slot", () => {
  const recoveredKnife: Item = { id: "dart", name: "Bone dart", kind: "throwable", rarity: "Common", power: 3, value: 7 };
  const packedKnife: Item = { id: "glass", name: "Blackglass shard", kind: "throwable", rarity: "Rare", power: 9, value: 30 };

  it("offers recovered weapons before packed weapons and filters other haul", () => {
    const items = throwablesInUseOrder([...recovered, recoveredKnife], [...packed, packedKnife]);
    expect(items.map((item) => item.id)).toEqual(["dart", "glass"]);
  });

  it("repairs, advances, and wraps throwable selections", () => {
    const items = throwablesInUseOrder([recoveredKnife], [packedKnife]);
    expect(resolveThrowableId(items, "glass")).toBe("glass");
    expect(resolveThrowableId(items, "spent")).toBe("dart");
    expect(nextThrowableId(items, undefined)).toBe("dart");
    expect(nextThrowableId(items, "dart")).toBe("glass");
    expect(nextThrowableId(items, "glass")).toBe("dart");
    expect(nextThrowableId([], "dart")).toBeUndefined();
  });

  it("summarizes recovered and packed throwables without building an ordered array", () => {
    const target = { count: 0 };
    expect(summarizeQuickslot([recoveredKnife], [packedKnife], "throwable", "glass", target)).toEqual({ count: 2, selected: packedKnife });
    expect(summarizeQuickslot(recovered, packed, "throwable", undefined, target)).toEqual({ count: 0, selected: undefined });
  });
});
