import * as THREE from "three";
import { describe, expect, it, vi } from "vitest";
import { disposeSceneResources } from "../src/game/resources";
import gameSource from "../src/game/game.ts?raw";

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
});
