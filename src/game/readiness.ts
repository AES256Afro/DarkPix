import type { ClassId, DungeonDepth } from "./types";

export interface RaidReadinessInput {
  classId: ClassId;
  depth: DungeonDepth;
  health: number;
  maxHealth: number;
  stamina: number;
  maxStamina: number;
  spellCharges: number;
  maxSpellCharges: number;
  sigils: number;
  portalUnlocked: boolean;
  campfireUsed: boolean;
}

export interface RaidReadinessSummary {
  vigor: string;
  stamina: string;
  memory: string;
  passage: string;
  campfire: string;
}

function resourceCount(current: number, maximum: number): string {
  const safeMaximum = Number.isFinite(maximum) ? Math.max(1, Math.ceil(maximum)) : 1;
  const safeCurrent = Number.isFinite(current) ? Math.min(safeMaximum, Math.max(0, Math.ceil(current))) : 0;
  return `${safeCurrent} / ${safeMaximum}`;
}

export function raidReadinessSummary(input: RaidReadinessInput): RaidReadinessSummary {
  const sigils = Number.isFinite(input.sigils) ? Math.min(2, Math.max(0, Math.floor(input.sigils))) : 0;
  const passageName = input.depth === 2 ? "ASHEN" : "BLUE";
  return {
    vigor: resourceCount(input.health, input.maxHealth),
    stamina: resourceCount(input.stamina, input.maxStamina),
    memory: input.classId === "hexbound" ? `${resourceCount(input.spellCharges, input.maxSpellCharges)} CHARGES` : "NOT USED",
    passage: input.portalUnlocked ? `${passageName} OPEN` : `${passageName} SIGILS ${sigils} / 2`,
    campfire: input.campfireUsed ? "SPENT" : "AVAILABLE",
  };
}
