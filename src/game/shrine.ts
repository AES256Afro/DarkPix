export type ShrineOffering = "blood" | "exchange";

export interface ShrineOfferingRules {
  healthCost: number;
  rewardCount: number;
  lootDepthBonus: number;
  alertRadius: number;
}

export function shrineOfferingRules(offering: ShrineOffering): ShrineOfferingRules {
  if (offering === "exchange") return { healthCost: 0, rewardCount: 1, lootDepthBonus: 0.24, alertRadius: 12 };
  return { healthCost: 18, rewardCount: 2, lootDepthBonus: 0.16, alertRadius: 16 };
}
