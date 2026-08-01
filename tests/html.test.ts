import { describe, expect, it } from "vitest";
import { escapeHtml } from "../src/html";

describe("HTML encoding", () => {
  it("encodes persisted text and attribute delimiters", () => {
    expect(escapeHtml(`<img alt="loot" onerror='raid()'>&`)).toBe(
      "&lt;img alt=&quot;loot&quot; onerror=&#39;raid()&#39;&gt;&amp;",
    );
    expect(escapeHtml(42)).toBe("42");
  });
});
