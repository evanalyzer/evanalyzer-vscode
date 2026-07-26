import { parseTree } from "jsonc-parser";
import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { schemaAtPath } from "./schemaAtPath";
import type { RootSchemaFile } from "./types";

const schemasDir = path.join(__dirname, "..", "..", "schemas");

function loadSchema(fileName: string): RootSchemaFile {
  return JSON.parse(readFileSync(path.join(schemasDir, fileName), "utf8"));
}

describe("schemaAtPath against the real pipeline_template schema", () => {
  const root = loadSchema("pipeline_template.schema.json");

  it("resolves the merged, discriminator-selected schema for a chosen oneOf variant (blur)", () => {
    const tree = parseTree(JSON.stringify({ meta: {}, pipelineSteps: [{ enabled: true, command: { type: "blur" } }] }))!;
    const schema = schemaAtPath(root, root.$defs, tree, ["pipelineSteps", 0, "command"]);

    expect(schema?.required).toEqual(["type"]);
    expect(Object.keys(schema?.properties ?? {}).sort()).toEqual(["kernelSize", "type"]);
    expect(schema?.properties?.kernelSize?.default).toBe(3);
  });

  it("resolves a different variant's own required fields (distanceTransform)", () => {
    const tree = parseTree(JSON.stringify({ meta: {}, pipelineSteps: [{ enabled: true, command: { type: "distanceTransform" } }] }))!;
    const schema = schemaAtPath(root, root.$defs, tree, ["pipelineSteps", 0, "command"]);

    expect(schema?.required).toEqual(expect.arrayContaining(["threshold", "edgesAreBackground", "type"]));
  });

  it("returns undefined when the discriminator value hasn't been set yet", () => {
    const tree = parseTree(JSON.stringify({ meta: {}, pipelineSteps: [{ enabled: true, command: {} }] }))!;
    const schema = schemaAtPath(root, root.$defs, tree, ["pipelineSteps", 0, "command"]);
    expect(schema).toBeUndefined();
  });

  it("resolves array item schemas via the items keyword", () => {
    const tree = parseTree(JSON.stringify({ meta: {}, pipelineSteps: [] }))!;
    const schema = schemaAtPath(root, root.$defs, tree, ["pipelineSteps", 0]);
    // PipelineStepSettings.
    expect(schema?.required).toEqual(expect.arrayContaining(["enabled", "command"]));
  });

  it("returns the (unresolved, top-level) schema for the root path", () => {
    const tree = parseTree("{}")!;
    const schema = schemaAtPath(root, root.$defs, tree, []);
    expect(schema?.type).toBe("object");
    expect(schema?.required).toEqual(expect.arrayContaining(["meta", "pipelineSteps"]));
  });
});

describe("schemaAtPath against the real project schema (anyOf-nullable: GlobalImageSettings.pixelSizes)", () => {
  const root = loadSchema("project.schema.json");

  it("resolves the non-null branch of an anyOf-nullable field when a value is present", () => {
    const tree = parseTree(JSON.stringify({ images: { settings: { pixelSizes: { x: 1, y: 1, z: 1 } } } }))!;
    const schema = schemaAtPath(root, root.$defs, tree, ["images", "settings", "pixelSizes"]);
    expect(schema?.type).toBe("object");
    expect(schema?.type).not.toBe("null");
  });

  it("resolves the null branch of an anyOf-nullable field when the value is null", () => {
    const tree = parseTree(JSON.stringify({ images: { settings: { pixelSizes: null } } }))!;
    const schema = schemaAtPath(root, root.$defs, tree, ["images", "settings", "pixelSizes"]);
    expect(schema?.type).toBe("null");
  });
});

describe("schemaAtPath against the real project_template schema (Class)", () => {
  const root = loadSchema("project_template.schema.json");

  it("resolves Class - the schema behind the Add Class / Fill Defaults features", () => {
    const tree = parseTree(JSON.stringify({ classification: { classes: [{}] } }))!;
    const schema = schemaAtPath(root, root.$defs, tree, ["classification", "classes", 0]);
    expect(schema?.required).toEqual(expect.arrayContaining(["id", "color", "name", "notes", "measure"]));
  });
});
