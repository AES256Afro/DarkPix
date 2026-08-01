import type { Item } from "./types";

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

export function equippedPower(items: Item[], kind: "weapon" | "armor"): number {
  return items.reduce((highest, item) => item.kind === kind ? Math.max(highest, item.power) : highest, 0);
}
