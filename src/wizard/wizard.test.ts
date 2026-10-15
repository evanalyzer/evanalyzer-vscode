import { readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { beforeEach, describe, expect, it } from "vitest";
import { window } from "../test/vscode-mock";
import {
  mockAcceptInput,
  mockCancelInput,
  mockCancelPick,
  mockFastForwardEverythingElse,
  mockFastForwardInput,
  mockFastForwardPick,
  mockPickLabel,
} from "../test/wizardTestHelpers";
import { ALL_FILE_TYPES } from "../fileTypes";
import type { RootSchemaFile } from "../schema/types";
import { WizardCancelled, runWizard } from "./wizard";

const schemasDir = path.join(__dirname, "..", "..", "schemas");
const componentSchema: RootSchemaFile = JSON.parse(readFileSync(path.join(schemasDir, "component_template.schema.json"), "utf8"));
const commandSchema = componentSchema.$defs.PipelineCommand;
const commandVariantLabels = commandSchema.oneOf!.map((v) => v.properties!.type!.const as string);

beforeEach(() => {
  window.showQuickPick.mockReset();
  window.createInputBox.mockReset();
});

describe("runWizard: cancelling the very first prompt aborts", () => {
  it("aborts when the first prompt is a plain text field (ComponentTemplate.key)", async () => {
    mockCancelInput();
    await expect(runWizard(componentSchema, componentSchema.$defs, "ComponentTemplate")).rejects.toThrow(WizardCancelled);
  });

  it("aborts when the first prompt is a oneOf variant picker (PipelineCommand's type)", async () => {
    mockCancelPick();
    await expect(runWizard(commandSchema, componentSchema.$defs, "Pipeline Command")).rejects.toThrow(WizardCancelled);
  });
});

describe("runWizard: cancelling any later prompt skips that field instead of aborting", () => {
  it("fills the rest of the object with schema defaults / empty values after the first field is answered", async () => {
    mockAcceptInput("NUCLEI_DETECTION"); // key
    mockCancelInput(); // meta.name
    mockCancelInput(); // meta.shortDescription
    mockCancelInput(); // meta.description
    mockCancelPick(); // meta's optional-field picker ("authors"/"tags"/...) - Esc = stop adding
    mockCancelPick(); // steps "add another?" - Esc = stop adding
    mockCancelPick(); // parameters "add another?"
    mockCancelPick(); // root optional-field picker ("classes"/"uses"/...)

    const result = await runWizard(componentSchema, componentSchema.$defs, "ComponentTemplate");

    expect(result.key).toBe("NUCLEI_DETECTION");
    expect(result.meta).toMatchObject({ name: "", shortDescription: "", description: "" });
    expect(typeof (result.meta as Record<string, unknown>).creationTime).toBe("string");
    expect(result.steps).toEqual([]);
    expect(result.parameters).toEqual([]);
  });

  it("zero-fills a required number/boolean pair with no defaults after picking a variant with no other prompts (DISTANCE_TRANSFORM)", async () => {
    mockPickLabel("DISTANCE_TRANSFORM"); // command type - not the first prompt in this test's context
    mockCancelInput(); // threshold (number, no default)
    mockCancelPick(); // edgesAreBackground (boolean, no default)

    const command = await runWizard(commandSchema, componentSchema.$defs, "Pipeline Command");

    expect(command).toEqual({ type: "DISTANCE_TRANSFORM", threshold: 0, edgesAreBackground: false });
  });
});

describe('runWizard: "Done - fill everything else with defaults"', () => {
  it("completes instantly when triggered on the very first prompt", async () => {
    mockFastForwardInput();
    mockFastForwardEverythingElse();

    const result = await runWizard(componentSchema, componentSchema.$defs, "ComponentTemplate");

    expect(result.meta).toMatchObject({ name: "", shortDescription: "", description: "", authors: [], tags: [] });
    expect(result).toMatchObject({ key: "", steps: [], parameters: [], classes: [], uses: [] });
  });

  it("falls back to the first declared variant when triggered on the command-type picker itself", async () => {
    mockFastForwardPick();
    mockFastForwardEverythingElse();

    const command = await runWizard(commandSchema, componentSchema.$defs, "Pipeline Command");

    expect(command.type).toBe(commandVariantLabels[0]); // "AI_OBJECT_CLASSIFIER"
  });

  it("still includes optional fields that have a schema default, not just required ones", async () => {
    mockPickLabel("BLUR");
    mockFastForwardEverythingElse();

    const command = await runWizard(commandSchema, componentSchema.$defs, "Pipeline Command");

    expect(command).toEqual({ type: "BLUR", kernelSize: 3 });
  });

  it("regression: fills optional defaults when triggered from the optional-fields picker of a command with zero required fields (GAUSSIAN_BLUR)", async () => {
    // GAUSSIAN_BLUR's only properties (kernelSize, sigma) are both optional
    // with a default, so its very next prompt after the type picker is the
    // optional-fields picker itself - this is exactly the scenario that
    // silently produced `{ type: "GAUSSIAN_BLUR" }` before the break/continue fix.
    mockPickLabel("GAUSSIAN_BLUR");
    mockFastForwardPick(); // the optional-fields picker's own fast-forward item

    const command = await runWizard(commandSchema, componentSchema.$defs, "Pipeline Command");

    expect(command).toEqual({ type: "GAUSSIAN_BLUR", kernelSize: 3, sigma: 0.3400000035762787 });
  });

  it.each(commandVariantLabels)("produces every default-bearing field for command type %s", async (label) => {
    mockPickLabel(label);
    mockFastForwardEverythingElse();

    const command = await runWizard(commandSchema, componentSchema.$defs, "Pipeline Command");

    const variantSchema = commandSchema.oneOf!.find((v) => v.properties!.type!.const === label)!;
    const expectedDefaultKeys = Object.entries(variantSchema.$ref ? resolveRefForTest(variantSchema) : variantSchema.properties ?? {})
      .filter(([key, propSchema]) => key !== "type" && (propSchema as { default?: unknown }).default !== undefined)
      .map(([key]) => key);

    for (const key of expectedDefaultKeys) {
      expect(command).toHaveProperty(key);
    }
    expect(command.type).toBe(label);
  });
});

describe("runWizard: externally tagged variants and nullable primitive types", () => {
  it("offers a step's variants by their key and merges the shared id/enabled fields into the picked one", async () => {
    mockPickLabel("component");
    mockFastForwardEverythingElse();

    const step = await runWizard(componentSchema.$defs.PipelineStepSettings, componentSchema.$defs, "Step");

    expect(step).toEqual({ enabled: false, component: { key: "", values: {} }, id: 0 });
  });

  it("labels ObjectClass variants GLOBAL/LOCAL/UNSET and builds the picked one", async () => {
    window.showQuickPick.mockImplementationOnce(async (items: Array<{ label: string }>) => {
      expect(items.map((i) => i.label)).toEqual(expect.arrayContaining(["UNSET", "GLOBAL", "LOCAL"]));
      return items.find((i) => i.label === "LOCAL");
    });
    mockAcceptInput("2");

    const objectClass = await runWizard(componentSchema.$defs.ObjectClass, componentSchema.$defs, "Class");

    expect(objectClass).toEqual({ LOCAL: 2 });
  });

  it('treats `"type": ["integer", "null"]` as an integer prompt', async () => {
    mockAcceptInput("4");

    const result = await runWizard(
      { type: "object", required: ["version"], properties: { version: { type: ["integer", "null"] } } },
      {},
      "Versioned"
    );

    expect(result).toEqual({ version: 4 });
  });
});

// Small local helper just for the parametrized test above: resolves a
// variant's $ref (schemars puts the settings behind $ref, siblings hold
// only the "type" tag) without pulling in the full resolveSchema merge
// semantics test coverage already has its own file for.
function resolveRefForTest(variant: { $ref?: string }): Record<string, unknown> {
  const refName = variant.$ref!.replace("#/$defs/", "");
  return (componentSchema.$defs[refName] as { properties?: Record<string, unknown> })?.properties ?? {};
}

describe("runWizard: every file type's wizard completes on fast-forward", () => {
  it.each(ALL_FILE_TYPES.map((fileType) => [fileType.title, fileType] as const))("%s", async (_title, fileType) => {
    const schema: RootSchemaFile = JSON.parse(readFileSync(path.join(schemasDir, fileType.schemaFile), "utf8"));
    mockFastForwardEverythingElse();

    const result = await runWizard(schema, schema.$defs, fileType.title);

    expect(Object.keys(result)).toEqual(expect.arrayContaining(schema.required ?? []));
    if (process.env.EVA_WIZARD_OUT) {
      writeFileSync(path.join(process.env.EVA_WIZARD_OUT, `wizard${fileType.extension}`), JSON.stringify(result, null, 2));
    }
  });
});
