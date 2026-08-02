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

export interface ProjectileStoneOutcome {
  cue: "SHOT BLOCKED" | "STONE HELD";
  message: string;
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
  target?: ProjectilePoint,
): ProjectilePoint {
  const position = playerProjectilePosition(start, end, elapsed, duration, kind === "knife" ? "throwable" : "spell", target);
  const safeDuration = Number.isFinite(duration) && duration > 0 ? Math.max(0.14, duration) : 0.14;
  const flightProgress = Number.isFinite(elapsed) ? Math.min(1, Math.max(0, elapsed / safeDuration)) : 0;
  if (kind === "knife") position.y -= Math.sin(flightProgress * Math.PI) * 0.06;
  return position;
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

export function enemyProjectileTargetsThreat(sourceId: number | undefined, targetId: number): boolean {
  return Number.isFinite(targetId) && targetId > 0 && (sourceId === undefined || !Number.isFinite(sourceId) || sourceId !== targetId);
}

export function playerProjectilePosition(
  start: ProjectilePoint,
  end: ProjectilePoint,
  elapsed: number,
  duration: number,
  kind: PlayerProjectileKind,
  target: ProjectilePoint = { x: 0, y: 0, z: 0 },
): ProjectilePoint {
  const safeDuration = Number.isFinite(duration) && duration > 0 ? duration : 0.12;
  const progress = Math.min(1, Math.max(0, Number.isFinite(elapsed) ? elapsed / safeDuration : 0));
  const arc = kind === "arrow" ? Math.sin(progress * Math.PI) * 0.34 : kind === "throwable" ? Math.sin(progress * Math.PI) * 0.2 : 0;
  target.x = start.x + (end.x - start.x) * progress;
  target.y = start.y + (end.y - start.y) * progress + arc;
  target.z = start.z + (end.z - start.z) * progress;
  return target;
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
  const segmentX = end.x - start.x;
  const segmentY = end.y - start.y;
  const segmentZ = end.z - start.z;
  const toTargetX = target.x - start.x;
  const toTargetY = target.y - start.y;
  const toTargetZ = target.z - start.z;
  const lengthSquared = segmentX ** 2 + segmentY ** 2 + segmentZ ** 2;
  const progress = lengthSquared > 0
    ? Math.min(1, Math.max(0, (toTargetX * segmentX + toTargetY * segmentY + toTargetZ * segmentZ) / lengthSquared))
    : 0;
  return Math.hypot(
    target.x - (start.x + segmentX * progress),
    target.y - (start.y + segmentY * progress),
    target.z - (start.z + segmentZ * progress),
  ) <= radius ? progress : undefined;
}

export function projectileTargetContact(headContact: number | undefined, bodyContact: number | undefined, target?: ProjectileTargetContact): ProjectileTargetContact | undefined {
  const head = Number.isFinite(headContact) && headContact! >= 0 && headContact! <= 1 ? headContact : undefined;
  const body = Number.isFinite(bodyContact) && bodyContact! >= 0 && bodyContact! <= 1 ? bodyContact : undefined;
  if (head === undefined && body === undefined) return undefined;
  const contact = target ?? { progress: 0, headshot: false };
  contact.progress = head !== undefined && (body === undefined || head <= body) ? head : body!;
  contact.headshot = head !== undefined && (body === undefined || head <= body);
  return contact;
}

export function projectileContactPrecedes(contact: number | undefined, competingContact: number | undefined): boolean {
  const first = Number.isFinite(contact) && contact! >= 0 && contact! <= 1 ? contact : undefined;
  const competing = Number.isFinite(competingContact) && competingContact! >= 0 && competingContact! <= 1 ? competingContact : undefined;
  return first !== undefined && (competing === undefined || first <= competing);
}

export function projectileContactPoint(start: ProjectilePoint, end: ProjectilePoint, contact: number | undefined, target?: ProjectilePoint): ProjectilePoint | undefined {
  if (![start.x, start.y, start.z, end.x, end.y, end.z, contact].every(Number.isFinite) || contact! < 0 || contact! > 1) return undefined;
  const point = target ?? { x: 0, y: 0, z: 0 };
  point.x = start.x + (end.x - start.x) * contact!;
  point.y = start.y + (end.y - start.y) * contact!;
  point.z = start.z + (end.z - start.z) * contact!;
  return point;
}

export function projectileStoneOutcome(kind: PlayerProjectileKind | EnemyProjectileKind, thrownName?: string): ProjectileStoneOutcome {
  if (kind === "arrow") return { cue: "SHOT BLOCKED", message: "ARROW BROKEN · stone stops the shot." };
  if (kind === "spell") return { cue: "SHOT BLOCKED", message: "SPELL SPENT · stone grounds the bolt." };
  if (kind === "throwable") return { cue: "SHOT BLOCKED", message: `${thrownName?.trim() || "Thrown weapon"} strikes the stone and is lost.` };
  if (kind === "chain") return { cue: "STONE HELD", message: "STONE HELD · the Tollkeeper chain breaks against masonry." };
  if (kind === "dart") return { cue: "STONE HELD", message: "STONE HELD · the dart volley splinters against masonry." };
  return { cue: "STONE HELD", message: "STONE HELD · the rival knife breaks against masonry." };
}
