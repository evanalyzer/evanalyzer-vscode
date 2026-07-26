import { describe, expect, it } from "vitest";
import { nextClassId, nextPipelineId } from "./nextId";

describe("nextClassId", () => {
  it("returns 0 for an empty array", () => {
    expect(nextClassId([])).toBe(0);
  });

  it("returns 0 for non-array input", () => {
    expect(nextClassId(undefined)).toBe(0);
    expect(nextClassId(null)).toBe(0);
  });

  it("returns one past the highest VALID id, regardless of order", () => {
    expect(nextClassId([{ id: { VALID: 1 } }, { id: { VALID: 3 } }, { id: { VALID: 2 } }])).toBe(4);
  });

  it("ignores UNSET entries mixed in with VALID ones", () => {
    expect(nextClassId([{ id: "UNSET" }, { id: { VALID: 5 } }])).toBe(6);
  });

  it("ignores malformed entries rather than throwing", () => {
    expect(nextClassId([{}, { id: {} }, { id: { VALID: "not a number" } }, null, "garbage"])).toBe(0);
  });
});

describe("nextPipelineId", () => {
  it("returns 0 for an empty array", () => {
    expect(nextPipelineId([])).toBe(0);
  });

  it("returns one past the highest id", () => {
    expect(nextPipelineId([{ id: 0 }, { id: 1 }, { id: 4 }])).toBe(5);
  });

  it("ignores malformed entries rather than throwing", () => {
    expect(nextPipelineId([{}, { id: "not a number" }, null])).toBe(0);
  });
});
