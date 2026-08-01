import type { Item, ItemKind, Rarity, StashSort } from "./types";

const RARITY_RANK: Record<Rarity, number> = {
  Worn: 0,
  Common: 1,
  Uncommon: 2,
  Rare: 3,
  Epic: 4,
  Legendary: 5,
};

const KIND_RANK: Record<ItemKind, number> = {
  weapon: 0,
  armor: 1,
  consumable: 2,
  treasure: 3,
  sigil: 4,
};

export interface LoadoutStats {
  health: number;
  damage: number;
  armor: number;
  movementMultiplier: number;
  interactionDurationMultiplier: number;
  undeadDamageMultiplier: number;
}

export function toggleEquippedItem(selectedIds: ReadonlySet<string>, stash: Item[], targetId: string, limit = 2): Set<string> {
  const available = new Map(stash.filter((item) => item.kind !== "treasure" && item.kind !== "sigil").map((item) => [item.id, item]));
  const next = new Set([...selectedIds].filter((id) => available.has(id)));
  if (next.delete(targetId)) return next;

  const target = available.get(targetId);
  if (!target) return next;
  if (target.kind === "weapon" || target.kind === "armor") {
    for (const selectedId of next) {
      if (available.get(selectedId)?.kind === target.kind) next.delete(selectedId);
    }
  }
  if (next.size < Math.max(0, Math.floor(limit))) next.add(targetId);
  return next;
}

export function sortStash(items: readonly Item[], mode: StashSort): Item[] {
  if (mode === "recent") return [...items].reverse();
  return items
    .map((item, index) => ({ item, index }))
    .sort((left, right) => {
      const primary = mode === "rarity"
        ? RARITY_RANK[right.item.rarity] - RARITY_RANK[left.item.rarity]
        : mode === "value"
          ? right.item.value - left.item.value
          : KIND_RANK[left.item.kind] - KIND_RANK[right.item.kind];
      if (primary !== 0) return primary;
      const rarity = RARITY_RANK[right.item.rarity] - RARITY_RANK[left.item.rarity];
      if (rarity !== 0) return rarity;
      const power = right.item.power - left.item.power;
      if (power !== 0) return power;
      return left.index - right.index;
    })
    .map(({ item }) => item);
}

export function equippedPower(items: Item[], kind: "weapon" | "armor"): number {
  return items.reduce((highest, item) => item.kind === kind ? Math.max(highest, item.power) : highest, 0);
}

export function loadoutStats(items: Item[]): LoadoutStats {
  const stats: LoadoutStats = {
    health: 0,
    damage: 0,
    armor: 0,
    movementMultiplier: 1,
    interactionDurationMultiplier: 1,
    undeadDamageMultiplier: 1,
  };
  for (const item of items) {
    if (item.kind !== "weapon" && item.kind !== "armor") continue;
    if (item.modifier === "+3 edge damage") stats.damage += 3;
    if (item.modifier === "+7 armor") stats.armor += 7;
    if (item.modifier === "+8 maximum health") stats.health += 8;
    if (item.modifier === "+6% movement speed") stats.movementMultiplier *= 1.06;
    if (item.modifier === "+5% interaction speed") stats.interactionDurationMultiplier /= 1.05;
    if (item.modifier === "+12% undead damage") stats.undeadDamageMultiplier *= 1.12;
  }
  return stats;
}

export function physicalDamageAfterArmor(amount: number, armor: number): number {
  const safeAmount = Number.isFinite(amount) ? Math.max(0, amount) : 0;
  const safeArmor = Number.isFinite(armor) ? Math.max(0, armor) : 0;
  return safeAmount * (100 / (100 + safeArmor));
}
