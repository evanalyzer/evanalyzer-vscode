import { describe, expect, it } from "vitest";
import { componentCompletions } from "./componentCompletions";

/** `|` marks the cursor. */
function complete(textWithCursor: string, isComponentFile = false) {
  const offset = textWithCursor.indexOf("|");
  const text = textWithCursor.slice(0, offset) + textWithCursor.slice(offset + 1);
  return componentCompletions(text, offset, isComponentFile);
}

const definitions = JSON.stringify([
  {
    key: "SMOOTH",
    meta: { name: "Smooth", shortDescription: "Blurs" },
    steps: [
      { id: 1, command: { type: "BLUR" } },
      { id: 4, command: { type: "GAUSSIAN_BLUR" } },
    ],
    parameters: [
      { key: "kernel", label: "Kernel", description: "Kernel size", default: 3 },
      { key: "sigma", label: "Sigma", default: 0.5 },
    ],
  },
  { key: "DETECT", steps: [], parameters: [] },
]);

describe("componentCompletions", () => {
  it("offers defined component keys for a component step's key", () => {
    const items = complete(`{"components": ${definitions}, "pipelines": [{"steps": [{"component": {"key": "S|"}}]}]}`);
    expect(items.map((i) => i.label)).toEqual(["SMOOTH", "DETECT"]);
    expect(items[0]).toMatchObject({ insertText: '"SMOOTH"', detail: "Smooth", documentation: "Blurs" });
    expect(items[0].replace?.length).toBe(3); // the typed `"S"`
  });

  it("doesn't offer a component to its own steps", () => {
    const text = `{"components": [{"key": "SELF", "steps": [{"component": {"key": "|"}}]}, {"key": "OTHER"}]}`;
    expect(complete(text).map((i) => i.label)).toEqual(["OTHER"]);
  });

  it("offers a .evacomp's uses, not its own root, for component keys", () => {
    const items = complete(`{"key": "ROOT", "uses": ${definitions}, "steps": [{"component": {"key": "|"}}]}`, true);
    expect(items.map((i) => i.label)).toEqual(["SMOOTH", "DETECT"]);
  });

  it("offers the used component's parameters that aren't set yet as values keys", () => {
    const items = complete(
      `{"components": ${definitions}, "pipelines": [{"steps": [{"component": {"key": "SMOOTH", "values": {"kernel": 5, "|"}}}]}]}`
    );
    expect(items.map((i) => i.label)).toEqual(["sigma"]);
    expect(items[0].insertText).toBe('"sigma"');
  });

  it("inserts the whole property with the parameter's default on an empty spot", () => {
    const items = complete(`{"components": ${definitions}, "pipelines": [{"steps": [{"component": {"key": "SMOOTH", "values": {|}}}]}]}`);
    expect(items.map((i) => i.insertText)).toEqual(['"kernel": 3', '"sigma": 0.5']);
    expect(items[0].documentation).toBe("Kernel size");
  });

  it("offers the component's step ids for a parameter binding's step", () => {
    const text = `{"components": [{"key": "A", "steps": [{"id": 1, "command": {"type": "BLUR"}}, {"id": 2, "component": {"key": "B"}}], "parameters": [{"key": "p", "bindings": [{"step": |}]}]}]}`;
    const items = complete(text);
    expect(items.map((i) => [i.label, i.detail])).toEqual([
      ["1", "BLUR"],
      ["2", "component B"],
    ]);
  });

  it("offers nothing elsewhere", () => {
    expect(complete(`{"components": ${definitions}, "meta": {"name": "|"}}`)).toEqual([]);
  });
});
