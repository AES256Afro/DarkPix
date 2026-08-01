import { describe, expect, it } from "vitest";
import { recordUnseenStrike } from "../src/game/stealth";

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
});
