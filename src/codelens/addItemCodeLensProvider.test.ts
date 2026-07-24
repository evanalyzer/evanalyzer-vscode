import { describe, expect, it } from "vitest";
import { createTestDocument } from "../test/testDocument";
import { AddItemCodeLensProvider } from "./addItemCodeLensProvider";

const provider = new AddItemCodeLensProvider();

describe("AddItemCodeLensProvider", () => {
  it("returns nothing for a file type it doesn't recognize", () => {
    const document = createTestDocument(JSON.stringify({ classes: [] }), "notes.json");
    expect(provider.provideCodeLenses(document as never)).toEqual([]);
  });

  it("adds one 'Add Class' button above the classes array", () => {
    const document = createTestDocument(JSON.stringify({ classification: { classes: [{}, {}] } }), "test.evapt");
    const lenses = provider.provideCodeLenses(document as never);
    const classLenses = lenses.filter((l) => l.command?.command === "evanalyzer.addClass");
    expect(classLenses).toHaveLength(1);
    expect(classLenses[0].command?.arguments).toEqual([document.uri, ["classification", "classes"]]);
  });

  it("adds one 'Add Pipeline' button above the top-level pipelines array only", () => {
    const document = createTestDocument(JSON.stringify({ pipelines: [{ pipelineSteps: [] }] }), "test.evapt");
    const lenses = provider.provideCodeLenses(document as never);
    const pipelineLenses = lenses.filter((l) => l.command?.command === "evanalyzer.addPipeline");
    expect(pipelineLenses).toHaveLength(1);
    expect(pipelineLenses[0].command?.arguments).toEqual([document.uri, ["pipelines"]]);
  });

  it("gives an empty pipelineSteps array exactly one (append) Add Pipeline Command button", () => {
    const document = createTestDocument(JSON.stringify({ pipelineSteps: [] }), "test.evapipe");
    const lenses = provider.provideCodeLenses(document as never).filter((l) => l.command?.command === "evanalyzer.addPipelineCommand");
    expect(lenses).toHaveLength(1);
    expect(lenses[0].command?.arguments).toEqual([document.uri, ["pipelineSteps"]]); // no index = append
  });

  it("gives an array of N items exactly N+1 Add Pipeline Command buttons: one before each item, one to append", () => {
    const document = createTestDocument(
      JSON.stringify({ pipelineSteps: [{ command: { type: "blur" } }, { command: { type: "gaussianBlur" } }, { command: { type: "laplacian" } }] }),
      "test.evapipe"
    );
    const lenses = provider.provideCodeLenses(document as never).filter((l) => l.command?.command === "evanalyzer.addPipelineCommand");

    expect(lenses).toHaveLength(4);
    // Insert-before-item buttons carry an explicit index, in item order.
    expect(lenses[0].command?.arguments).toEqual([document.uri, ["pipelineSteps"], 0]);
    expect(lenses[1].command?.arguments).toEqual([document.uri, ["pipelineSteps"], 1]);
    expect(lenses[2].command?.arguments).toEqual([document.uri, ["pipelineSteps"], 2]);
    // Trailing append button carries no index.
    expect(lenses[3].command?.arguments).toEqual([document.uri, ["pipelineSteps"]]);
  });

  it("anchors the trailing append button on the array's closing bracket, not above the first item", () => {
    const text = ["{", '  "pipelineSteps": [', '    { "enabled": true, "command": { "type": "blur" } }', "  ]", "}"].join("\n");
    const document = createTestDocument(text, "test.evapipe");
    const lenses = provider.provideCodeLenses(document as never).filter((l) => l.command?.command === "evanalyzer.addPipelineCommand");

    expect(lenses).toHaveLength(2);
    const beforeItem = lenses.find((l) => l.command?.arguments?.length === 3)!;
    const append = lenses.find((l) => l.command?.arguments?.length === 2)!;

    expect(beforeItem.range.start.line).toBe(2); // the line with the item's opening brace
    expect(append.range.start.line).toBe(3); // the line with the closing "]"
    expect(append.range.start.line).not.toBe(beforeItem.range.start.line);
  });

  it("gives each pipeline in project_template's pipelines array its own independent set of buttons", () => {
    const document = createTestDocument(
      JSON.stringify({
        pipelines: [{ pipelineSteps: [{ command: { type: "blur" } }] }, { pipelineSteps: [] }],
      }),
      "test.evapt"
    );
    const lenses = provider.provideCodeLenses(document as never).filter((l) => l.command?.command === "evanalyzer.addPipelineCommand");

    const forPipeline0 = lenses.filter((l) => JSON.stringify(l.command?.arguments?.[1]).includes('"pipelines",0'));
    const forPipeline1 = lenses.filter((l) => JSON.stringify(l.command?.arguments?.[1]).includes('"pipelines",1'));
    expect(forPipeline0).toHaveLength(2); // 1 item -> before it + append
    expect(forPipeline1).toHaveLength(1); // empty -> append only
  });
});
