import type { Item } from "./types";

export function consumablesInUseOrder(recovered: readonly Item[], packed: readonly Item[]): Item[] {
  return [...recovered, ...packed].filter((item) => item.kind === "consumable");
}

export function resolveConsumableId(items: readonly Item[], selectedId: string | undefined): string | undefined {
  if (selectedId && items.some((item) => item.id === selectedId)) return selectedId;
  return items[0]?.id;
}

export function nextConsumableId(items: readonly Item[], selectedId: string | undefined): string | undefined {
  if (!items.length) return undefined;
  const selectedIndex = items.findIndex((item) => item.id === selectedId);
  return items[(selectedIndex + 1) % items.length]?.id;
}
