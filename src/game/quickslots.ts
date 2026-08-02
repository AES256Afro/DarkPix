import type { Item } from "./types";

export interface QuickslotSummary {
  count: number;
  selected?: Item;
}

export function summarizeQuickslot(
  recovered: readonly Item[],
  packed: readonly Item[],
  kind: "consumable" | "throwable",
  selectedId: string | undefined,
  target: QuickslotSummary = { count: 0 },
): QuickslotSummary {
  target.count = 0;
  target.selected = undefined;
  let first: Item | undefined;
  for (const item of recovered) {
    if (item.kind !== kind) continue;
    target.count += 1;
    first ??= item;
    if (item.id === selectedId) target.selected = item;
  }
  for (const item of packed) {
    if (item.kind !== kind) continue;
    target.count += 1;
    first ??= item;
    if (item.id === selectedId) target.selected = item;
  }
  target.selected ??= first;
  return target;
}

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

export function throwablesInUseOrder(recovered: readonly Item[], packed: readonly Item[]): Item[] {
  return [...recovered, ...packed].filter((item) => item.kind === "throwable");
}

export function resolveThrowableId(items: readonly Item[], selectedId: string | undefined): string | undefined {
  if (selectedId && items.some((item) => item.id === selectedId)) return selectedId;
  return items[0]?.id;
}

export function nextThrowableId(items: readonly Item[], selectedId: string | undefined): string | undefined {
  if (!items.length) return undefined;
  const selectedIndex = items.findIndex((item) => item.id === selectedId);
  return items[(selectedIndex + 1) % items.length]?.id;
}
