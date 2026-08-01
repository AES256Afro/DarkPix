import type { Vec2 } from "./types";

export interface WallSpec extends Vec2 {
  width: number;
  depth: number;
}

export interface ChestSpec extends Vec2 {
  depthBonus: number;
}

export interface EnemySpec extends Vec2 {
  kind: "skeleton" | "crawler" | "warden" | "rival";
}

export interface TorchSpec extends Vec2 {
  rotation: number;
}

export const DUNGEON = {
  name: "Crypt of the Pale Toll",
  size: 44,
  playerStart: { x: 0, z: 17.4 },
  campfire: { x: -16, z: 15 },
  portal: { x: 16, z: -16 },
  walls: [
    { x: 0, z: -22, width: 44, depth: 1 },
    { x: 0, z: 22, width: 44, depth: 1 },
    { x: -22, z: 0, width: 1, depth: 44 },
    { x: 22, z: 0, width: 1, depth: 44 },
    { x: -10, z: 14, width: 1, depth: 15 },
    { x: -10, z: -13, width: 1, depth: 13 },
    { x: 10, z: 15, width: 1, depth: 13 },
    { x: 10, z: -12, width: 1, depth: 16 },
    { x: -19, z: 7, width: 6, depth: 1 },
    { x: -12, z: 7, width: 4, depth: 1 },
    { x: 12, z: 7, width: 4, depth: 1 },
    { x: 19, z: 7, width: 6, depth: 1 },
    { x: -19, z: -7, width: 6, depth: 1 },
    { x: -12, z: -7, width: 4, depth: 1 },
    { x: 12, z: -7, width: 4, depth: 1 },
    { x: 19, z: -7, width: 6, depth: 1 },
    { x: -4, z: 3, width: 12, depth: 1 },
    { x: 5, z: -3, width: 11, depth: 1 },
  ] satisfies WallSpec[],
  pillars: [
    { x: -19, z: 19 },
    { x: 19, z: 19 },
    { x: -19, z: -19 },
    { x: 19, z: -19 },
    { x: -8, z: 5 },
    { x: 8, z: -5 },
  ] satisfies Vec2[],
  torches: [
    { x: -7, z: 18, rotation: 0 },
    { x: 7, z: 18, rotation: 0 },
    { x: -18, z: 10, rotation: Math.PI / 2 },
    { x: 18, z: 10, rotation: -Math.PI / 2 },
    { x: -7, z: 1.5, rotation: 0 },
    { x: 7, z: -1.5, rotation: Math.PI },
    { x: -18, z: -12, rotation: Math.PI / 2 },
    { x: 18, z: -12, rotation: -Math.PI / 2 },
    { x: 0, z: -20.5, rotation: Math.PI },
  ] satisfies TorchSpec[],
  chests: [
    { x: -16, z: 11, depthBonus: 0.01 },
    { x: 16, z: 12, depthBonus: 0.03 },
    { x: -16, z: -15, depthBonus: 0.08 },
    { x: 4, z: -16, depthBonus: 0.12 },
  ] satisfies ChestSpec[],
  enemies: [
    { kind: "crawler", x: -5, z: 12 },
    { kind: "skeleton", x: 5, z: 9 },
    { kind: "warden", x: -16, z: -11 },
    { kind: "warden", x: 15, z: 2 },
    { kind: "skeleton", x: 4, z: -11 },
    { kind: "crawler", x: -4, z: -17 },
    { kind: "rival", x: 14, z: -12 },
  ] satisfies EnemySpec[],
} as const;

export function dungeonCollides(position: Vec2, radius = 0.38): boolean {
  const walls: WallSpec[] = [
    ...DUNGEON.walls,
    ...DUNGEON.pillars.map((pillar) => ({ ...pillar, width: 1.1, depth: 1.1 })),
  ];
  return walls.some((wall) =>
    Math.abs(position.x - wall.x) < wall.width / 2 + radius &&
    Math.abs(position.z - wall.z) < wall.depth / 2 + radius,
  );
}

function snap(value: number, step: number): number {
  return Math.round(value / step) * step;
}

export function dungeonPathExists(start: Vec2, target: Vec2, radius = 0.38, step = 0.5): boolean {
  const origin = { x: snap(start.x, step), z: snap(start.z, step) };
  const destination = { x: snap(target.x, step), z: snap(target.z, step) };
  const key = (point: Vec2) => `${point.x.toFixed(2)}:${point.z.toFixed(2)}`;
  const destinationKey = key(destination);
  const queue: Vec2[] = [origin];
  const visited = new Set([key(origin)]);
  const half = DUNGEON.size / 2;
  let cursor = 0;

  while (cursor < queue.length) {
    const current = queue[cursor++];
    if (!current) break;
    if (key(current) === destinationKey) return true;
    for (const [dx, dz] of [[step, 0], [-step, 0], [0, step], [0, -step]] as const) {
      const next = { x: current.x + dx, z: current.z + dz };
      if (Math.abs(next.x) > half || Math.abs(next.z) > half || dungeonCollides(next, radius)) continue;
      const nextKey = key(next);
      if (visited.has(nextKey)) continue;
      visited.add(nextKey);
      queue.push(next);
    }
  }
  return false;
}
