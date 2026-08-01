import { describe, expect, it } from "vitest";
import { consumablesInUseOrder, nextConsumableId, resolveConsumableId } from "../src/game/quickslots";
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
});
