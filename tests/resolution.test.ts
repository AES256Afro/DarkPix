import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { MIN_RENDER_SCALE, adaptiveRenderScale, initialRenderScale, maximumRenderScale } from "../src/game/resolution";

const gameSource = readFileSync(new URL("../src/game/game.ts", import.meta.url), "utf8");

describe("adaptive raid resolution", () => {
  it("starts mobile and desktop viewports at bounded pixel-art scales", () => {
    expect(initialRenderScale(500)).toBe(0.72);
    expect(initialRenderScale(1200)).toBe(0.82);
    expect(maximumRenderScale(500)).toBe(0.76);
    expect(maximumRenderScale(1200)).toBe(0.9);
  });

  it("responds gradually to sustained frame pressure and recovery", () => {
    expect(adaptiveRenderScale(0.82, 26, 1200)).toBe(0.76);
    expect(adaptiveRenderScale(0.82, 21, 1200)).toBe(0.79);
    expect(adaptiveRenderScale(0.82, 14, 1200)).toBe(0.85);
    expect(adaptiveRenderScale(0.82, 16.7, 1200)).toBe(0.82);
  });

  it("never escapes device caps or accepts non-finite measurements", () => {
    expect(adaptiveRenderScale(0.6, 50, 1200)).toBe(MIN_RENDER_SCALE);
    expect(adaptiveRenderScale(0.76, 10, 500)).toBe(0.76);
    expect(adaptiveRenderScale(Number.NaN, Number.NaN, 1200)).toBe(0.82);
  });

  it("keeps frame-hot darkness updates on cached HUD nodes", () => {
    const updateZone = gameSource.slice(gameSource.indexOf("private updateZone"), gameSource.indexOf("private updateInteraction"));
    expect(updateZone).toContain("setTextIfChanged(this.zoneHud");
    expect(updateZone).toContain('this.raidShell.style.setProperty("--darkness"');
    expect(updateZone).not.toContain("querySelector");
  });

  it("deduplicates frame-hot HUD text writes", () => {
    const updateHudStart = gameSource.indexOf("private updateHud");
    const updateHud = gameSource.slice(updateHudStart, gameSource.indexOf("private feed(", updateHudStart));
    expect(gameSource).toContain("function setTextIfChanged");
    expect(updateHud).toContain("setTextIfChanged(this.raidClock");
    expect(updateHud).toContain("setTextIfChanged(this.wayfinderHud");
    expect(updateHud).not.toContain(".textContent =");
  });
});
