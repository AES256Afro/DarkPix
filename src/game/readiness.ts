import type { ClassId, DungeonDepth, Vec2 } from "./types";
import { MAX_TORCH_FUEL_SECONDS } from "./light";
import { depthRules } from "./depth";
import { cardinalDirection } from "./navigation";
import { directionToZoneCenter, distanceFromZoneCenter, zoneState } from "./zone";

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
  torchLit: boolean;
  torchFuel: number;
}

export interface RaidReadinessSummary {
  vigor: string;
  stamina: string;
  memory: string;
  passage: string;
  campfire: string;
  torch: string;
}

export interface RaidHazardReadiness {
  remainingSeconds: number;
  safety: string;
}

function resourceCount(current: number, maximum: number): string {
  const safeMaximum = Number.isFinite(maximum) ? Math.max(1, Math.ceil(maximum)) : 1;
  const safeCurrent = Number.isFinite(current) ? Math.min(safeMaximum, Math.max(0, Math.ceil(current))) : 0;
  return `${safeCurrent} / ${safeMaximum}`;
}

export function raidReadinessSummary(input: RaidReadinessInput): RaidReadinessSummary {
  const sigils = Number.isFinite(input.sigils) ? Math.min(2, Math.max(0, Math.floor(input.sigils))) : 0;
  const torchFuel = Number.isFinite(input.torchFuel) ? Math.min(MAX_TORCH_FUEL_SECONDS, Math.max(0, input.torchFuel)) : 0;
  const passageName = input.depth === 2 ? "ASHEN" : "BLUE";
  return {
    vigor: resourceCount(input.health, input.maxHealth),
    stamina: resourceCount(input.stamina, input.maxStamina),
    memory: input.classId === "hexbound" ? `${resourceCount(input.spellCharges, input.maxSpellCharges)} CHARGES` : "NOT USED",
    passage: input.portalUnlocked ? `${passageName} OPEN` : `${passageName} SIGILS ${sigils} / 2`,
    campfire: input.campfireUsed ? "SPENT" : "AVAILABLE",
    torch: torchFuel > 0 ? `${input.torchLit ? "LIT" : "HOODED"} · ${Math.ceil(torchFuel)}S` : "SPENT",
  };
}

export function raidHazardReadiness(depth: DungeonDepth, elapsed: number, passage: Vec2, position: Vec2): RaidHazardReadiness {
  const rules = depthRules(depth);
  const safeElapsed = Number.isFinite(elapsed) ? Math.max(0, elapsed) : 0;
  const safePosition = {
    x: Number.isFinite(position.x) ? position.x : 0,
    z: Number.isFinite(position.z) ? position.z : 0,
  };
  const zone = zoneState(safeElapsed, rules.duration, passage);
  const distance = distanceFromZoneCenter(safePosition, zone);
  const outsideDistance = Math.max(0, distance - zone.radius);
  const safety = outsideDistance > 0
    ? `DARK · ${Math.ceil(outsideDistance)}M OUT · ${cardinalDirection(directionToZoneCenter(safePosition, zone))} TO SAFETY`
    : safeElapsed < rules.spawnGrace
      ? `WARDING VEIL · ${Math.ceil(rules.spawnGrace - safeElapsed)}S`
      : zone.progress === 0
        ? "DARKNESS DORMANT"
        : `INSIDE · ${Math.round(zone.radius)}M SAFE REACH`;
  return { remainingSeconds: Math.max(0, rules.duration - safeElapsed), safety };
}
