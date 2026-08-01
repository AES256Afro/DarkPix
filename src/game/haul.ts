import type { Item } from "./types";

export const HAUL_CAPACITY = 8;
export const RIVAL_HAUL_CAPACITY = 2;

export function haulCount(items: readonly Item[]): number {
  return items.reduce((count, item) => count + (item.kind === "sigil" ? 0 : 1), 0);
}

export function canAddToHaul(items: readonly Item[], item: Item, capacity = HAUL_CAPACITY): boolean {
  if (item.kind === "sigil") return true;
  const safeCapacity = Number.isFinite(capacity) ? Math.max(0, Math.floor(capacity)) : HAUL_CAPACITY;
  return haulCount(items) < safeCapacity;
}

export function canRivalScavenge(items: readonly Item[], item: Item): boolean {
  return item.kind !== "sigil" && items.length < RIVAL_HAUL_CAPACITY;
}

export function treasureGold(item: Item): number {
  return item.kind === "treasure" ? Math.max(3, Math.floor(item.value * 0.35)) : 0;
}

export function dropLeastValuable(items: readonly Item[]): { kept: Item[]; dropped?: Item } {
  let lowestIndex = -1;
  for (let index = 0; index < items.length; index += 1) {
    const item = items[index];
    if (!item || item.kind === "sigil") continue;
    const lowest = lowestIndex >= 0 ? items[lowestIndex] : undefined;
    if (!lowest || item.value < lowest.value || (item.value === lowest.value && item.power < lowest.power)) lowestIndex = index;
  }
  if (lowestIndex < 0) return { kept: [...items] };
  return {
    kept: items.filter((_, index) => index !== lowestIndex),
    dropped: items[lowestIndex],
  };
}
