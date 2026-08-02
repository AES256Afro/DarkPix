import * as THREE from "three";
import { describe, expect, it, vi } from "vitest";
import { disposeSceneResources } from "../src/game/resources";
import gameSource from "../src/game/game.ts?raw";
import dungeonSource from "../src/game/dungeon.ts?raw";
import projectileSource from "../src/game/projectile.ts?raw";
import audioSource from "../src/game/audio.ts?raw";

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

  it("updates darkness geometry in raid-owned scratch state", () => {
    const updateZone = gameSource.slice(gameSource.indexOf("private updateZone"), gameSource.indexOf("private updateInteraction"));
    expect(gameSource).toContain("private readonly scratchZone: ZoneState");
    expect(updateZone).toContain("this.scratchZone");
    expect(updateZone).toContain("this.scratchDirection");
    expect(updateZone).not.toContain("distanceOutsideZone");
    expect(updateZone).not.toContain("{ x: this.camera.position.x");
  });

  it("keeps movement and trap collision scans free of array callbacks", () => {
    const collides = gameSource.slice(gameSource.indexOf("private collides("), gameSource.indexOf("private hasDungeonSight("));
    const traps = gameSource.slice(gameSource.indexOf("private updateTraps"), gameSource.indexOf("private updateAshVents"));
    const enemyCollision = gameSource.slice(gameSource.indexOf("private collidesEnemy"), gameSource.indexOf("private enemyStepHeight"));
    expect(collides).toContain("for (const wall of this.walls)");
    expect(collides).not.toContain(".some(");
    expect(traps).not.toContain(".find(");
    expect(traps).not.toContain(".reduce(");
    expect(traps).not.toContain("Math.hypot(");
    expect(traps).toContain("triggerRadius * triggerRadius");
    expect(enemyCollision).not.toContain(".some(");
    expect(enemyCollision).not.toContain("{ x, z }");
  });

  it("refreshes the HUD below render cadence without throttling simulation", () => {
    const update = gameSource.slice(gameSource.indexOf("private update(delta"), gameSource.indexOf("private phaseElapsed"));
    expect(gameSource).toContain("const HUD_REFRESH_SECONDS = 1 / 20");
    expect(gameSource).toContain("private hudRefreshTimer = 0");
    expect(update).toMatch(/this\.hudRefreshTimer = Math\.max\(0, this\.hudRefreshTimer - delta\);[\s\S]+if \(this\.hudRefreshTimer === 0\)[\s\S]+this\.updateHud\(\)/);
    expect(update.indexOf("this.updateEnemies(delta)")).toBeLessThan(update.indexOf("this.hudRefreshTimer"));
  });

  it("reuses projectile contact and impact records during flight", () => {
    const playerProjectiles = gameSource.slice(gameSource.indexOf("private updatePlayerProjectiles"), gameSource.indexOf("private resolvePlayerProjectileHit"));
    const enemyProjectiles = gameSource.slice(gameSource.indexOf("private updateEnemyProjectiles"), gameSource.indexOf("private resolveEnemyProjectileHit"));
    expect(gameSource).toContain("private readonly scratchProjectileContact: ProjectileTargetContact");
    expect(playerProjectiles).toContain("this.scratchProjectileContact");
    expect(playerProjectiles).toContain("this.scratchProjectileNext");
    expect(enemyProjectiles).toContain("this.scratchProjectileNext");
    expect(playerProjectiles).not.toContain("let enemyContact: {");
    expect(enemyProjectiles).not.toContain("let enemyContact: {");
    expect(playerProjectiles).not.toContain("{ x: previous.x");
    expect(enemyProjectiles).not.toContain("{ x: previous.x");
  });

  it("validates frame-hot projectile and footstep scalars without temporary arrays", () => {
    const projectileSweep = projectileSource.slice(projectileSource.indexOf("export function projectileSegmentContact"), projectileSource.indexOf("export function projectileTargetContact"));
    const footstepCadence = audioSource.slice(audioSource.indexOf("export function footstepCadenceCrossed"), audioSource.indexOf("function createBrowserAudioContext"));
    expect(projectileSweep).toContain("Number.isFinite(start.x)");
    expect(projectileSweep).not.toContain(".every(Number.isFinite)");
    expect(footstepCadence).not.toContain(".every(Number.isFinite)");
    expect(dungeonSource).not.toMatch(/dungeonProjectileStoneContact[\s\S]+\.every\(Number\.isFinite\)/);
  });

  it("derives passive enemy awareness once per simulation frame", () => {
    const updateEnemies = gameSource.slice(gameSource.indexOf("private updateEnemies"), gameSource.indexOf("private resolveBossToll"));
    const enemyLoop = updateEnemies.indexOf("for (const enemy of this.enemies)");
    expect(updateEnemies.indexOf("const passiveAcquisitionEnabled")).toBeLessThan(enemyLoop);
    expect(updateEnemies.indexOf("const awareness = passiveAwarenessRange")).toBeLessThan(enemyLoop);
    expect(updateEnemies.match(/passiveAwarenessRange\(/g)).toHaveLength(1);
    expect(updateEnemies.match(/this\.phaseElapsed\(\)/g)).toHaveLength(1);
    expect(updateEnemies.match(/depthRules\(this\.depth\)/g)).toHaveLength(1);
  });

  it("animates loose loot without a per-frame array callback", () => {
    const animateWorld = gameSource.slice(gameSource.indexOf("private animateWorld"), gameSource.indexOf("private updateHud"));
    expect(animateWorld).toContain("for (const pickup of this.pickups)");
    expect(animateWorld).not.toContain("this.pickups.forEach");
  });

  it("drives delver footsteps from collision-resolved travel", () => {
    const movement = gameSource.slice(gameSource.indexOf("private updateMovement"), gameSource.indexOf("private dodge():"));
    expect(movement).toMatch(/const startX = this\.camera\.position\.x;[\s\S]+this\.moveWithCollision\(offset\.x, offset\.z\);[\s\S]+const traveled = Math\.hypot/);
    expect(movement).toContain("this.footstepClock += traveled");
    expect(movement).not.toContain("this.footstepClock += delta * speed");
  });

  it("reuses raid vectors while resolving repeated attacks", () => {
    const resolveStrike = gameSource.slice(gameSource.indexOf("private resolveStrike"), gameSource.indexOf("private launchPlayerProjectile"));
    expect(resolveStrike).toContain("this.scratchForward.set(0, 0, -1)");
    expect(resolveStrike).toContain("this.scratchToTarget.copy(enemy.group.position)");
    expect(resolveStrike).not.toContain("new THREE.Vector3");
    expect(resolveStrike).not.toContain(".clone()");
  });

  it("reuses raid vectors while acquiring thrown-weapon targets", () => {
    const throwItem = gameSource.slice(gameSource.indexOf("private throwItem"), gameSource.indexOf("private availableThrowables"));
    expect(throwItem).toContain("this.scratchForward.set(0, 0, -1)");
    expect(throwItem).toContain("this.scratchToTarget.copy(enemy.group.position)");
    expect(throwItem).not.toContain("new THREE.Vector3");
    expect(throwItem).not.toContain(".clone()");
  });

  it("avoids disposable vectors across projectile, guard, and drop actions", () => {
    const dartLaunch = gameSource.slice(gameSource.indexOf("private launchDartProjectile"), gameSource.indexOf("private attack()"));
    const playerLaunch = gameSource.slice(gameSource.indexOf("private launchPlayerProjectile"), gameSource.indexOf("private updatePlayerProjectiles"));
    const enemyLaunch = gameSource.slice(gameSource.indexOf("private launchEnemyProjectile"), gameSource.indexOf("private launchIncomingProjectile"));
    const projectileDefense = gameSource.slice(gameSource.indexOf("private resolveEnemyProjectileHit"), gameSource.indexOf("private removeEnemyProjectile"));
    const dropHaul = gameSource.slice(gameSource.indexOf("private dropLowestHaul"), gameSource.indexOf("private openChest"));
    expect(dartLaunch.match(/new THREE\.Vector3/g)).toHaveLength(1);
    expect(playerLaunch).not.toContain("new THREE.Vector3");
    expect(enemyLaunch).not.toContain("new THREE.Vector3");
    expect(projectileDefense).toContain("this.scratchForward.set(0, 0, -1)");
    expect(projectileDefense).not.toContain("new THREE.Vector3");
    expect(dropHaul).toContain("safeDroppedLootPosition(this.camera.position, this.scratchDirection");
    expect(dropHaul).toContain("this.scratchInteractionTarget");
    expect(dropHaul).not.toContain("new THREE.Vector3");
  });

  it("applies area abilities in one allocation-free threat scan", () => {
    const abilities = gameSource.slice(gameSource.indexOf("private useClassAbility"), gameSource.indexOf("private updateZone"));
    expect(abilities).toContain("distanceToSquared");
    expect(abilities).not.toContain("this.enemies.filter");
    expect(abilities).not.toContain("for (const enemy of [...nearby])");
  });

  it("hands terminal verdicts off before a background timer can be frozen", () => {
    const finish = gameSource.slice(gameSource.indexOf("private finish(reason"), gameSource.indexOf("private resize"));
    expect(finish).toContain("queueMicrotask(() => this.options.onFinish(result))");
    expect(finish).not.toContain("lifecycleTimers.schedule");
    expect(finish).not.toContain("setTimeout");
  });
});
