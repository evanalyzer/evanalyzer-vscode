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

describe("schemaAtPath against the real component_template schema", () => {
  const root = loadSchema("component_template.schema.json");

  it("resolves the merged, discriminator-selected schema for a chosen oneOf variant (BLUR)", () => {
    const tree = parseTree(JSON.stringify({ steps: [{ enabled: true, command: { type: "BLUR" } }] }))!;
    const schema = schemaAtPath(root, root.$defs, tree, ["steps", 0, "command"]);

    expect(schema?.required).toEqual(["type"]);
    expect(Object.keys(schema?.properties ?? {}).sort()).toEqual(["kernelSize", "type"]);
    expect(schema?.properties?.kernelSize?.default).toBe(3);
  });

  it("resolves a different variant's own required fields (DISTANCE_TRANSFORM)", () => {
    const tree = parseTree(JSON.stringify({ steps: [{ enabled: true, command: { type: "DISTANCE_TRANSFORM" } }] }))!;
    const schema = schemaAtPath(root, root.$defs, tree, ["steps", 0, "command"]);

    expect(schema?.required).toEqual(expect.arrayContaining(["threshold", "edgesAreBackground", "type"]));
  });

  it("returns undefined when the discriminator value hasn't been set yet", () => {
    const tree = parseTree(JSON.stringify({ steps: [{ enabled: true, command: {} }] }))!;
    const schema = schemaAtPath(root, root.$defs, tree, ["steps", 0, "command"]);
    expect(schema).toBeUndefined();
  });

  it("merges a step's shared id/enabled with its command variant, picked by the variant's key", () => {
    const tree = parseTree(JSON.stringify({ steps: [{ enabled: true, command: { type: "BLUR" } }] }))!;
    const schema = schemaAtPath(root, root.$defs, tree, ["steps", 0]);

    expect(Object.keys(schema?.properties ?? {}).sort()).toEqual(["command", "enabled", "id"]);
    expect(schema?.required).toEqual(expect.arrayContaining(["enabled", "command"]));
  });

  it("picks the component variant of a step from its key, through to ComponentInstance", () => {
    const tree = parseTree(JSON.stringify({ steps: [{ enabled: true, component: { key: "X" } }] }))!;
    const schema = schemaAtPath(root, root.$defs, tree, ["steps", 0, "component"]);

    expect(schema?.required).toEqual(["key"]);
    expect(schema?.properties?.values?.default).toEqual({});
  });

  it("still offers a step's shared fields before it has a command or component", () => {
    const tree = parseTree(JSON.stringify({ steps: [{}] }))!;
    const schema = schemaAtPath(root, root.$defs, tree, ["steps", 0]);

    expect(Object.keys(schema?.properties ?? {}).sort()).toEqual(["enabled", "id"]);
  });

  it("returns the (unresolved, top-level) schema for the root path", () => {
    const tree = parseTree("{}")!;
    const schema = schemaAtPath(root, root.$defs, tree, []);
    expect(schema?.type).toBe("object");
    expect(schema?.required).toEqual(expect.arrayContaining(["key", "meta", "steps", "parameters"]));
  });
});

describe("schemaAtPath against the real project schema (anyOf-nullable: GlobalImageSettings.pixelSizes)", () => {
  const root = loadSchema("project.schema.json");

  it("resolves the non-null branch of an anyOf-nullable field when a value is present", () => {
    const tree = parseTree(JSON.stringify({ images: { settings: { pixelSizes: { x: 1, y: 1, z: 1 } } } }))!;
    const schema = schemaAtPath(root, root.$defs, tree, ["images", "settings", "pixelSizes"]);
    expect(schema?.type).toBe("object");
  });

  it("resolves the null branch of an anyOf-nullable field when the value is null", () => {
    const tree = parseTree(JSON.stringify({ images: { settings: { pixelSizes: null } } }))!;
    const schema = schemaAtPath(root, root.$defs, tree, ["images", "settings", "pixelSizes"]);
    expect(schema?.type).toBe("null");
  });
});

describe("schemaAtPath against the real project_template schema", () => {
  const root = loadSchema("project_template.schema.json");

  it("resolves Class - the schema behind the Add Class / Fill Defaults features", () => {
    const tree = parseTree(JSON.stringify({ classification: { classes: [{}] } }))!;
    const schema = schemaAtPath(root, root.$defs, tree, ["classification", "classes", 0]);
    expect(schema?.required).toEqual(expect.arrayContaining(["id", "color", "name", "notes"]));
    expect(schema?.properties?.id?.type).toBe("integer");
  });

  it("resolves a component definition's steps the same way as a pipeline's", () => {
    const tree = parseTree(JSON.stringify({ components: [{ steps: [{ command: { type: "BLUR" } }] }] }))!;
    const schema = schemaAtPath(root, root.$defs, tree, ["components", 0, "steps", 0, "command"]);
    expect(schema?.properties?.kernelSize?.default).toBe(3);
  });
});
