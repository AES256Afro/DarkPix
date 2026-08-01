import { describe, expect, it } from "vitest";
import { recordUnseenStrike, unseenStrikeCue } from "../src/game/stealth";

describe("unseen strike evidence", () => {
  it("marks each unaware non-boss threat only once", () => {
    const marked = new Set<number>();
    expect(recordUnseenStrike(marked, { id: 1, kind: "skeleton", alerted: false })).toBe(true);
    expect(recordUnseenStrike(marked, { id: 1, kind: "skeleton", alerted: false })).toBe(false);
    expect(recordUnseenStrike(marked, { id: 2, kind: "rival", alerted: false })).toBe(true);
    expect(recordUnseenStrike(marked, { id: 3, kind: "crawler", alerted: true })).toBe(false);
    expect(recordUnseenStrike(marked, { id: 4, kind: "boss", alerted: false })).toBe(false);
    expect([...marked]).toEqual([1, 2]);
  });

  it("names every crosshair awareness state without relying on color", () => {
    const marked = new Set([1]);
    expect(unseenStrikeCue(marked, { id: 2, kind: "crawler", alerted: false })).toEqual({ state: "eligible", label: "UNSEEN MARK READY" });
    expect(unseenStrikeCue(marked, { id: 1, kind: "skeleton", alerted: false })).toEqual({ state: "marked", label: "UNSEEN MARK RECORDED" });
    expect(unseenStrikeCue(marked, { id: 3, kind: "rival", alerted: true })).toEqual({ state: "aware", label: "TARGET AWARE · NO MARK" });
    expect(unseenStrikeCue(marked, { id: 4, kind: "boss", alerted: false })).toEqual({ state: "ineligible", label: "KEEPER · NO UNSEEN MARK" });
  });
});
