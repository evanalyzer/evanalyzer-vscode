import { describe, expect, it } from "vitest";
import { nextClassId, nextPipelineId, nextStepId } from "./nextId";

describe("nextClassId", () => {
  it("returns 1 for an empty array - 0 is the background's", () => {
    expect(nextClassId([])).toBe(1);
  });

  it("returns 1 for non-array input", () => {
    expect(nextClassId(undefined)).toBe(1);
    expect(nextClassId(null)).toBe(1);
  });

  it("returns one past the highest id, regardless of order", () => {
    expect(nextClassId([{ id: 1 }, { id: 3 }, { id: 2 }])).toBe(4);
  });

  it("ignores malformed entries rather than throwing", () => {
    expect(nextClassId([{}, { id: {} }, { id: "not a number" }, null, "garbage"])).toBe(1);
  });
});

describe("nextStepId", () => {
  it("returns 1 for an empty list - 0 is StepId::UNASSIGNED", () => {
    expect(nextStepId([])).toBe(1);
  });

  it("returns one past the highest id", () => {
    expect(nextStepId([{ id: 1 }, { id: 7 }, { id: 0 }])).toBe(8);
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
