import { describe, expect, it } from "vitest";
import { createTestDocument } from "../test/testDocument";
import { AddItemCodeLensProvider } from "./addItemCodeLensProvider";

const provider = new AddItemCodeLensProvider();

function lensesFor(value: unknown, fileName: string, command?: string) {
  const document = createTestDocument(JSON.stringify(value), fileName);
  const lenses = provider.provideCodeLenses(document as never);
  return { document, lenses: command ? lenses.filter((l) => l.command?.command === command) : lenses };
}

describe("AddItemCodeLensProvider", () => {
  it("returns nothing for a file type it doesn't recognize", () => {
    expect(lensesFor({ classes: [] }, "notes.json").lenses).toEqual([]);
  });

  it("adds one 'Add Class' button above the classification classes array", () => {
    const { document, lenses } = lensesFor({ classification: { classes: [{}, {}] } }, "test.evatemplate", "evanalyzer.addClass");
    expect(lenses).toHaveLength(1);
    expect(lenses[0].command?.arguments).toEqual([document.uri, ["classification", "classes"]]);
  });

  it("adds 'Add Class' to a module's local classes, but not to a SCRIPT command's classes", () => {
    const { lenses } = lensesFor(
      { modules: [{ classes: [], steps: [{ command: { type: "SCRIPT", classes: [] } }] }] },
      "test.evaproj",
      "evanalyzer.addClass"
    );
    expect(lenses.map((l) => l.command?.arguments?.[1])).toEqual([["modules", 0, "classes"]]);
  });

  it("adds 'Add Class' at a .evamodule root and in its used modules", () => {
    const { lenses } = lensesFor({ classes: [], uses: [{ classes: [] }] }, "test.evamodule", "evanalyzer.addClass");
    expect(lenses.map((l) => l.command?.arguments?.[1])).toEqual([["classes"], ["uses", 0, "classes"]]);
  });

  it("adds one 'Add Pipeline' button above the top-level pipelines array only", () => {
    const { document, lenses } = lensesFor({ pipelines: [{ steps: [] }] }, "test.evatemplate", "evanalyzer.addPipeline");
    expect(lenses).toHaveLength(1);
    expect(lenses[0].command?.arguments).toEqual([document.uri, ["pipelines"]]);
  });

  it("adds 'Add Module Definition' to modules (projects) and uses (.evamodule)", () => {
    expect(lensesFor({ modules: [] }, "p.evaproj", "evanalyzer.addModuleDefinition").lenses).toHaveLength(1);
    expect(lensesFor({ uses: [] }, "c.evamodule", "evanalyzer.addModuleDefinition").lenses).toHaveLength(1);
    expect(lensesFor({ modules: [] }, "c.evamodule", "evanalyzer.addModuleDefinition").lenses).toHaveLength(0);
  });

  it("adds 'Add Parameter' to a module definition's parameters", () => {
    const { lenses } = lensesFor({ parameters: [], uses: [{ parameters: [] }] }, "c.evamodule", "evanalyzer.addModuleParameter");
    expect(lenses.map((l) => l.command?.arguments?.[1])).toEqual([["parameters"], ["uses", 0, "parameters"]]);
  });

  it("gives an empty steps array exactly one (append) Add Pipeline Command and one Use Module button", () => {
    const { document, lenses } = lensesFor({ steps: [] }, "test.evamodule");
    const commandLenses = lenses.filter((l) => l.command?.command === "evanalyzer.addPipelineCommand");
    const moduleLenses = lenses.filter((l) => l.command?.command === "evanalyzer.addModuleStep");
    expect(commandLenses).toHaveLength(1);
    expect(moduleLenses).toHaveLength(1);
    expect(commandLenses[0].command?.arguments).toEqual([document.uri, ["steps"]]); // no index = append
  });

  it("gives an array of N items exactly N+1 Add Pipeline Command buttons: one before each item, one to append", () => {
    const { document, lenses } = lensesFor(
      { steps: [{ command: { type: "BLUR" } }, { command: { type: "GAUSSIAN_BLUR" } }, { command: { type: "LAPLACIAN" } }] },
      "test.evamodule",
      "evanalyzer.addPipelineCommand"
    );

    expect(lenses).toHaveLength(4);
    // Insert-before-item buttons carry an explicit index, in item order.
    expect(lenses[0].command?.arguments).toEqual([document.uri, ["steps"], 0]);
    expect(lenses[1].command?.arguments).toEqual([document.uri, ["steps"], 1]);
    expect(lenses[2].command?.arguments).toEqual([document.uri, ["steps"], 2]);
    // Trailing append button carries no index.
    expect(lenses[3].command?.arguments).toEqual([document.uri, ["steps"]]);
  });

  it("anchors the trailing append button on the array's closing bracket, not above the first item", () => {
    const text = ["{", '  "steps": [', '    { "enabled": true, "command": { "type": "BLUR" } }', "  ]", "}"].join("\n");
    const document = createTestDocument(text, "test.evamodule");
    const lenses = provider.provideCodeLenses(document as never).filter((l) => l.command?.command === "evanalyzer.addPipelineCommand");

    expect(lenses).toHaveLength(2);
    const beforeItem = lenses.find((l) => l.command?.arguments?.length === 3)!;
    const append = lenses.find((l) => l.command?.arguments?.length === 2)!;

    expect(beforeItem.range.start.line).toBe(2); // the line with the item's opening brace
    expect(append.range.start.line).toBe(3); // the line with the closing "]"
  });

  it("gives each pipeline in a project template its own independent set of step buttons", () => {
    const { lenses } = lensesFor(
      { pipelines: [{ steps: [{ command: { type: "BLUR" } }] }, { steps: [] }] },
      "test.evatemplate",
      "evanalyzer.addPipelineCommand"
    );

    const forPipeline0 = lenses.filter((l) => JSON.stringify(l.command?.arguments?.[1]).includes('"pipelines",0'));
    const forPipeline1 = lenses.filter((l) => JSON.stringify(l.command?.arguments?.[1]).includes('"pipelines",1'));
    expect(forPipeline0).toHaveLength(2); // 1 item -> before it + append
    expect(forPipeline1).toHaveLength(1); // empty -> append only
  });

  it("doesn't treat a root-level steps array in a project as a step list", () => {
    expect(lensesFor({ steps: [] }, "test.evaproj", "evanalyzer.addPipelineCommand").lenses).toHaveLength(0);
  });
});
