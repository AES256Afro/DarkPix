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

function flatModifier(modifier: string | undefined, suffix: string, maximum: number): number {
  const match = modifier?.match(new RegExp(`^\\+(\\d+(?:\\.\\d+)?) ${suffix}$`));
  if (!match) return 0;
  return Math.min(maximum, Math.max(0, Number(match[1])));
}

function percentModifier(modifier: string | undefined, suffix: string, maximum: number): number {
  const match = modifier?.match(new RegExp(`^\\+(\\d+(?:\\.\\d+)?)% ${suffix}$`));
  if (!match) return 0;
  return Math.min(maximum, Math.max(0, Number(match[1]))) / 100;
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

export function saleNeedsConfirmation(item: Item, packed: boolean): boolean {
  return packed || RARITY_RANK[item.rarity] >= RARITY_RANK.Rare || item.id.startsWith("crafted-");
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
    stats.damage += flatModifier(item.modifier, "edge damage", 50);
    stats.armor += flatModifier(item.modifier, "armor", 100);
    stats.health += flatModifier(item.modifier, "maximum health", 100);
    stats.movementMultiplier *= 1 + percentModifier(item.modifier, "movement speed", 30);
    stats.interactionDurationMultiplier /= 1 + percentModifier(item.modifier, "interaction speed", 30);
    stats.undeadDamageMultiplier *= 1 + percentModifier(item.modifier, "undead damage", 100);
  }
  const armorWeight = equippedPower(items, "armor");
  stats.movementMultiplier *= 1 - Math.min(0.18, armorWeight * 0.008);
  return stats;
}

export function physicalDamageAfterArmor(amount: number, armor: number): number {
  const safeAmount = Number.isFinite(amount) ? Math.max(0, amount) : 0;
  const safeArmor = Number.isFinite(armor) ? Math.max(0, armor) : 0;
  return safeAmount * (100 / (100 + safeArmor));
}
