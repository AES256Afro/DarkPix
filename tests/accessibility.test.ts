import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import mainSource from "../src/main.ts?raw";

const styles = readFileSync(new URL("../src/style.css", import.meta.url), "utf8");

describe("lobby accessibility contracts", () => {
  it("exposes selected class, contract, loadout, and current navigation state", () => {
    expect(mainSource).toContain('aria-current="page"');
    expect(mainSource).toContain('aria-pressed="${entry.id === selectedClass}"');
    expect(mainSource).toContain('aria-pressed="${selectedRaidMode === "standard"}"');
    expect(mainSource).toContain('aria-pressed="${selected}"');
  });

  it("keeps every native control visibly focused and preserves selection in forced colors", () => {
    expect(styles).toContain("button:focus-visible, a:focus-visible, input:focus-visible, select:focus-visible");
    expect(styles).toContain("@media (forced-colors: active)");
    expect(styles).toContain(".class-card.selected, .raid-mode-picker button.selected, .stash-item.selected");
  });
});
