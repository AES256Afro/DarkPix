export type PlayerProjectileKind = "arrow" | "spell" | "throwable";
export type EnemyProjectileKind = "knife" | "chain" | "dart";
export type EnemyProjectileDefense = "parry" | "guard" | "hit";

export interface EnemyProjectileFlightCue {
  label: "KNIFE IN FLIGHT" | "CHAIN IN FLIGHT" | "DARTS IN FLIGHT";
  duration: number;
}

export interface ProjectilePoint {
  x: number;
  y: number;
  z: number;
}

export interface ProjectileTargetContact {
  progress: number;
  headshot: boolean;
}

export function playerProjectileDuration(distance: number, kind: PlayerProjectileKind): number {
  const safeDistance = Number.isFinite(distance) ? Math.max(0, distance) : 0;
  const speed = kind === "arrow" ? 18 : kind === "throwable" ? 15 : 13;
  return Math.min(1.25, Math.max(0.12, safeDistance / speed));
}

export function enemyProjectileDuration(distance: number, kind: EnemyProjectileKind): number {
  const safeDistance = Number.isFinite(distance) ? Math.max(0, distance) : 0;
  const speed = kind === "knife" ? 13 : kind === "dart" ? 16 : 10;
  return Math.min(1.15, Math.max(0.14, safeDistance / speed));
}

export function enemyProjectilePosition(
  start: ProjectilePoint,
  end: ProjectilePoint,
  elapsed: number,
  duration: number,
  kind: EnemyProjectileKind,
): ProjectilePoint {
  const position = playerProjectilePosition(start, end, elapsed, duration, kind === "knife" ? "throwable" : "spell");
  return kind === "knife" ? { ...position, y: position.y - Math.sin(Math.min(1, Math.max(0, elapsed / Math.max(0.14, duration))) * Math.PI) * 0.06 } : position;
}

export function enemyProjectileDefense(
  kind: EnemyProjectileKind,
  blocking: boolean,
  facingSource: boolean,
  blockAge: number,
): EnemyProjectileDefense {
  if (!blocking || !facingSource) return "hit";
  if (kind === "knife" && Number.isFinite(blockAge) && blockAge >= 0 && blockAge < 0.24) return "parry";
  return "guard";
}

export function enemyProjectileFlightCue(kind: EnemyProjectileKind, duration: number): EnemyProjectileFlightCue {
  const safeDuration = Number.isFinite(duration) ? Math.max(0.14, duration) : 0.14;
  return {
    label: kind === "chain" ? "CHAIN IN FLIGHT" : kind === "dart" ? "DARTS IN FLIGHT" : "KNIFE IN FLIGHT",
    duration: safeDuration + 0.12,
  };
}

export function enemyProjectilePauseSummary(kinds: readonly EnemyProjectileKind[]): string {
  const knives = kinds.filter((kind) => kind === "knife").length;
  const chains = kinds.filter((kind) => kind === "chain").length;
  const darts = kinds.filter((kind) => kind === "dart").length;
  if (knives === 0 && chains === 0 && darts === 0) return "CLEAR";
  return [
    knives > 0 ? `${knives} ${knives === 1 ? "KNIFE" : "KNIVES"}` : "",
    chains > 0 ? `${chains} CHAIN${chains === 1 ? "" : "S"}` : "",
    darts > 0 ? `${darts} DART VOLLEY${darts === 1 ? "" : "S"}` : "",
  ].filter(Boolean).join(" · ");
}

export function playerProjectilePosition(
  start: ProjectilePoint,
  end: ProjectilePoint,
  elapsed: number,
  duration: number,
  kind: PlayerProjectileKind,
): ProjectilePoint {
  const safeDuration = Number.isFinite(duration) && duration > 0 ? duration : 0.12;
  const progress = Math.min(1, Math.max(0, Number.isFinite(elapsed) ? elapsed / safeDuration : 0));
  const arc = kind === "arrow" ? Math.sin(progress * Math.PI) * 0.34 : kind === "throwable" ? Math.sin(progress * Math.PI) * 0.2 : 0;
  return {
    x: start.x + (end.x - start.x) * progress,
    y: start.y + (end.y - start.y) * progress + arc,
    z: start.z + (end.z - start.z) * progress,
  };
}

export function projectileImpactConnects(
  committedImpact: Pick<ProjectilePoint, "x" | "z">,
  currentTarget: Pick<ProjectilePoint, "x" | "z">,
  radius: number,
): boolean {
  if (![committedImpact.x, committedImpact.z, currentTarget.x, currentTarget.z, radius].every(Number.isFinite) || radius < 0) return false;
  return Math.hypot(committedImpact.x - currentTarget.x, committedImpact.z - currentTarget.z) <= radius;
}

export function projectileSegmentConnects(start: ProjectilePoint, end: ProjectilePoint, target: ProjectilePoint, radius: number): boolean {
  return projectileSegmentContact(start, end, target, radius) !== undefined;
}

export function projectileSegmentContact(start: ProjectilePoint, end: ProjectilePoint, target: ProjectilePoint, radius: number): number | undefined {
  if (![start.x, start.y, start.z, end.x, end.y, end.z, target.x, target.y, target.z, radius].every(Number.isFinite) || radius < 0) return undefined;
  const segment = { x: end.x - start.x, y: end.y - start.y, z: end.z - start.z };
  const toTarget = { x: target.x - start.x, y: target.y - start.y, z: target.z - start.z };
  const lengthSquared = segment.x ** 2 + segment.y ** 2 + segment.z ** 2;
  const progress = lengthSquared > 0
    ? Math.min(1, Math.max(0, (toTarget.x * segment.x + toTarget.y * segment.y + toTarget.z * segment.z) / lengthSquared))
    : 0;
  const nearest = {
    x: start.x + segment.x * progress,
    y: start.y + segment.y * progress,
    z: start.z + segment.z * progress,
  };
  return Math.hypot(target.x - nearest.x, target.y - nearest.y, target.z - nearest.z) <= radius ? progress : undefined;
}

export function projectileTargetContact(headContact: number | undefined, bodyContact: number | undefined): ProjectileTargetContact | undefined {
  const head = Number.isFinite(headContact) && headContact! >= 0 && headContact! <= 1 ? headContact : undefined;
  const body = Number.isFinite(bodyContact) && bodyContact! >= 0 && bodyContact! <= 1 ? bodyContact : undefined;
  if (head === undefined && body === undefined) return undefined;
  if (head !== undefined && (body === undefined || head <= body)) return { progress: head, headshot: true };
  return { progress: body!, headshot: false };
}
