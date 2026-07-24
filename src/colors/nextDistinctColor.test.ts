import { describe, expect, it } from "vitest";
import { nextDistinctColorHex } from "./nextDistinctColor";

const HEX_COLOR = /^#[0-9a-f]{6}$/;

describe("nextDistinctColorHex", () => {
  it("always produces a valid lowercase #rrggbb string (the exact format Class.color expects)", () => {
    for (let i = 0; i < 50; i++) {
      expect(nextDistinctColorHex(i)).toMatch(HEX_COLOR);
    }
  });

  it("is deterministic for a given index", () => {
    expect(nextDistinctColorHex(7)).toBe(nextDistinctColorHex(7));
  });

  it("produces visually distinct consecutive colors (golden-angle hue rotation)", () => {
    const colors = Array.from({ length: 10 }, (_, i) => nextDistinctColorHex(i));
    expect(new Set(colors).size).toBe(10);
  });
});
