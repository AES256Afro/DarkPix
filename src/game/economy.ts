import type { Item } from "./types";

export interface RaidValueSummaryInput {
  extracted: boolean;
  banked: readonly Item[];
  lost: readonly Item[];
  consumed: readonly Item[];
  goldGained: number;
  entryFee: number;
}

export interface RaidValueSummary {
  bankedItemValue: number;
  lostGearValue: number;
  consumedValue: number;
  grossReturn: number;
  netValue: number;
}

export function itemValueTotal(items: readonly Item[]): number {
  return items.reduce((total, item) => {
    const value = Number.isFinite(item.value) ? Math.max(0, Math.floor(item.value)) : 0;
    return total + value;
  }, 0);
}

export function raidValueSummary(input: RaidValueSummaryInput): RaidValueSummary {
  const bankedItemValue = itemValueTotal(input.banked);
  const lostGearValue = itemValueTotal(input.lost);
  const consumedValue = itemValueTotal(input.consumed);
  const goldGained = Number.isFinite(input.goldGained) ? Math.max(0, Math.floor(input.goldGained)) : 0;
  const entryFee = Number.isFinite(input.entryFee) ? Math.max(0, Math.floor(input.entryFee)) : 0;
  const grossReturn = input.extracted ? goldGained + bankedItemValue : 0;
  const netValue = input.extracted
    ? grossReturn - consumedValue - entryFee
    : -(lostGearValue + consumedValue + entryFee);
  return { bankedItemValue, lostGearValue, consumedValue, grossReturn, netValue };
}
