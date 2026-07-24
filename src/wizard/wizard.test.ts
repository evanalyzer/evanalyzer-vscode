import { readFileSync } from "node:fs";
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
import type { RootSchemaFile } from "../schema/types";
import { WizardCancelled, runWizard } from "./wizard";

const schemasDir = path.join(__dirname, "..", "..", "schemas");
const pipelineTemplateSchema: RootSchemaFile = JSON.parse(readFileSync(path.join(schemasDir, "pipeline_template.schema.json"), "utf8"));
const commandSchema = pipelineTemplateSchema.$defs.PipelineCommand;
const commandVariantLabels = commandSchema.oneOf!.map((v) => v.properties!.type!.const as string);

beforeEach(() => {
  window.showQuickPick.mockReset();
  window.createInputBox.mockReset();
});

describe("runWizard: cancelling the very first prompt aborts", () => {
  it("aborts when the first prompt is a plain text field (PipelineTemplate.meta.name)", async () => {
    mockCancelInput();
    await expect(runWizard(pipelineTemplateSchema, pipelineTemplateSchema.$defs, "PipelineTemplate")).rejects.toThrow(WizardCancelled);
  });

  it("aborts when the first prompt is a oneOf variant picker (PipelineCommand's type)", async () => {
    mockCancelPick();
    await expect(runWizard(commandSchema, pipelineTemplateSchema.$defs, "Pipeline Command")).rejects.toThrow(WizardCancelled);
  });
});

describe("runWizard: cancelling any later prompt skips that field instead of aborting", () => {
  it("fills the rest of the object with schema defaults / empty values after the first field is answered", async () => {
    mockAcceptInput("My Pipeline"); // meta.name
    mockCancelInput(); // shortDescription
    mockCancelInput(); // description
    mockCancelInput(); // authorFirstName
    mockCancelInput(); // authorLastName
    mockCancelInput(); // authorOrganization
    mockCancelPick(); // meta's optional-field picker ("category"/"tags") - Esc = stop adding
    mockCancelPick(); // pipelineSteps "add another?" - Esc = stop adding

    const result = await runWizard(pipelineTemplateSchema, pipelineTemplateSchema.$defs, "PipelineTemplate");

    expect(result.meta).toMatchObject({
      name: "My Pipeline",
      shortDescription: "",
      description: "",
      authorFirstName: "",
      authorLastName: "",
      authorOrganization: "",
    });
    expect(typeof (result.meta as Record<string, unknown>).creationTime).toBe("string");
    expect(result.pipelineSteps).toEqual([]);
  });

  it("zero-fills a required number/boolean pair with no defaults after picking a variant with no other prompts (distanceTransform)", async () => {
    mockPickLabel("distanceTransform"); // command type - not the first prompt in this test's context
    mockCancelInput(); // threshold (number, no default)
    mockCancelPick(); // edgesAreBackground (boolean, no default)

    const command = await runWizard(commandSchema, pipelineTemplateSchema.$defs, "Pipeline Command");

    expect(command).toEqual({ type: "distanceTransform", threshold: 0, edgesAreBackground: false });
  });
});

describe('runWizard: "Done - fill everything else with defaults"', () => {
  it("completes instantly when triggered on the very first prompt", async () => {
    mockFastForwardInput();
    mockFastForwardEverythingElse();

    const result = await runWizard(pipelineTemplateSchema, pipelineTemplateSchema.$defs, "PipelineTemplate");

    expect(result.meta).toMatchObject({ name: "", shortDescription: "", description: "" });
    expect(result.pipelineSteps).toEqual([]);
  });

  it("falls back to the first declared variant when triggered on the command-type picker itself", async () => {
    mockFastForwardPick();
    mockFastForwardEverythingElse();

    const command = await runWizard(commandSchema, pipelineTemplateSchema.$defs, "Pipeline Command");

    expect(command.type).toBe(commandVariantLabels[0]); // "blur"
  });

  it("still includes optional fields that have a schema default, not just required ones", async () => {
    mockPickLabel("blur");
    mockFastForwardEverythingElse();

    const command = await runWizard(commandSchema, pipelineTemplateSchema.$defs, "Pipeline Command");

    expect(command).toEqual({ type: "blur", kernelSize: 3 });
  });

  it("regression: fills optional defaults when triggered from the optional-fields picker of a command with zero required fields (gaussianBlur)", async () => {
    // gaussianBlur's only properties (kernelSize, sigma) are both optional
    // with a default, so its very next prompt after the type picker is the
    // optional-fields picker itself - this is exactly the scenario that
    // silently produced `{ type: "gaussianBlur" }` before the break/continue fix.
    mockPickLabel("gaussianBlur");
    mockFastForwardPick(); // the optional-fields picker's own fast-forward item

    const command = await runWizard(commandSchema, pipelineTemplateSchema.$defs, "Pipeline Command");

    expect(command).toEqual({ type: "gaussianBlur", kernelSize: 3, sigma: 0.3400000035762787 });
  });

  it.each(commandVariantLabels)("produces every default-bearing field for command type %s", async (label) => {
    mockPickLabel(label);
    mockFastForwardEverythingElse();

    const command = await runWizard(commandSchema, pipelineTemplateSchema.$defs, "Pipeline Command");

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

// Small local helper just for the parametrized test above: resolves a
// variant's $ref (schemars puts the settings behind $ref, siblings hold
// only the "type" tag) without pulling in the full resolveSchema merge
// semantics test coverage already has its own file for.
function resolveRefForTest(variant: { $ref?: string }): Record<string, unknown> {
  const refName = variant.$ref!.replace("#/$defs/", "");
  return (pipelineTemplateSchema.$defs[refName] as { properties?: Record<string, unknown> })?.properties ?? {};
}
