import { describe, expect, it } from "vitest";
import { MIN_RENDER_SCALE, adaptiveRenderScale, initialRenderScale, maximumRenderScale } from "../src/game/resolution";

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
});
