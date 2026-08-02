import * as THREE from "three";
import { describe, expect, it, vi } from "vitest";
import { disposeSceneResources } from "../src/game/resources";
import gameSource from "../src/game/game.ts?raw";
import dungeonSource from "../src/game/dungeon.ts?raw";

describe("raid resource cleanup", () => {
  it("disposes shared GPU resources exactly once", () => {
    const scene = new THREE.Scene();
    const texture = new THREE.Texture();
    const material = new THREE.MeshBasicMaterial({ map: texture });
    const geometry = new THREE.BoxGeometry();
    scene.add(new THREE.Mesh(geometry, material), new THREE.Mesh(geometry, material));
    const textureDispose = vi.spyOn(texture, "dispose");
    const materialDispose = vi.spyOn(material, "dispose");
    const geometryDispose = vi.spyOn(geometry, "dispose");

    disposeSceneResources(scene);

    expect(textureDispose).toHaveBeenCalledOnce();
    expect(materialDispose).toHaveBeenCalledOnce();
    expect(geometryDispose).toHaveBeenCalledOnce();
  });

  it("keeps interaction targeting allocation-free inside the frame loop", () => {
    const updateInteraction = gameSource.slice(
      gameSource.indexOf("private updateInteraction"),
      gameSource.indexOf("private interactionTargetDistance"),
    );
    expect(updateInteraction).toContain("this.scratchForward.set");
    expect(updateInteraction).toContain("this.interactionTargetDistance");
    expect(updateInteraction).not.toContain("new THREE.Vector3");
    expect(updateInteraction).not.toContain("const target = {");
  });

  it("caches immutable raid loadout power outside combat and awareness loops", () => {
    expect(gameSource).toContain('this.armorPower = equippedPower(options.equipped, "armor")');
    expect(gameSource).toContain('this.weaponPower = equippedPower(options.equipped, "weapon")');
    expect(gameSource).not.toContain("equippedPower(this.options.equipped");
  });

  it("animates registered wall torches without traversing the whole scene each frame", () => {
    const animateWorld = gameSource.slice(gameSource.indexOf("private animateWorld"), gameSource.indexOf("private updateHud"));
    expect(gameSource).toContain("this.animatedTorches.push({ flame, light, phase })");
    expect(animateWorld).toContain("for (const torch of this.animatedTorches)");
    expect(animateWorld).not.toContain("this.scene.traverse");
  });

  it("samples sight and projectile paths without rebuilding dungeon geometry", () => {
    const collision = dungeonSource.slice(
      dungeonSource.indexOf("function dungeonCoordinatesCollide"),
      dungeonSource.indexOf("export function encounterPosition"),
    );
    const lineOfSight = dungeonSource.slice(
      dungeonSource.indexOf("export function dungeonLineOfSight"),
      dungeonSource.indexOf("export function dungeonProjectilePathClear"),
    );
    expect(collision).toContain("for (const wall of DUNGEON.walls)");
    expect(collision).toContain("for (const pillar of DUNGEON.pillars)");
    expect(collision).not.toContain("DUNGEON.pillars.map");
    expect(lineOfSight).toContain("dungeonCoordinatesCollide(x, z");
    expect(lineOfSight).not.toContain("dungeonCollides({");
  });

  it("reuses coordinate records for repeated raid sight checks", () => {
    expect(gameSource).toContain("private readonly scratchSightStart: Vec2");
    expect(gameSource).toContain("private readonly scratchSightTarget: Vec2");
    expect(gameSource).toContain("private hasDungeonSightBetween(");
    expect(gameSource).not.toMatch(/this\.hasDungeonSight\(\s*\{ x:/);
  });
});
