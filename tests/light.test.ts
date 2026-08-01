import { describe, expect, it } from "vitest";
import { BLUEWAX_FUEL_SECONDS, MAX_TORCH_FUEL_SECONDS, addTorchFuel, spendTorchFuel } from "../src/game/light";

describe("finite delver torch", () => {
  it("burns only while unhooded", () => {
    expect(spendTorchFuel(MAX_TORCH_FUEL_SECONDS, 12.5, true)).toBe(77.5);
    expect(spendTorchFuel(40, 12.5, false)).toBe(40);
    expect(spendTorchFuel(3, 10, true)).toBe(0);
  });

  it("bounds malformed time and fuel", () => {
    expect(spendTorchFuel(Number.NaN, 2, true)).toBe(0);
    expect(spendTorchFuel(20, Number.NaN, true)).toBe(20);
    expect(addTorchFuel(-20, BLUEWAX_FUEL_SECONDS)).toBe(45);
    expect(addTorchFuel(80, BLUEWAX_FUEL_SECONDS)).toBe(MAX_TORCH_FUEL_SECONDS);
  });
});
