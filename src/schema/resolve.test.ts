import { describe, expect, it } from "vitest";
import { resolveSchema } from "./resolve";
import type { JsonSchema } from "./types";

describe("resolveSchema", () => {
  it("returns a schema unchanged when it has no $ref", () => {
    const schema: JsonSchema = { type: "string", default: "x" };
    expect(resolveSchema(schema, {})).toBe(schema);
  });

  it("resolves a bare $ref to the referenced def, unmerged", () => {
    const defs = { Foo: { type: "object", properties: { a: { type: "string" } } } } satisfies Record<string, JsonSchema>;
    const resolved = resolveSchema({ $ref: "#/$defs/Foo" }, defs);
    expect(resolved).toEqual({ type: "object", properties: { a: { type: "string" } } });
  });

  it("merges sibling keywords over the $ref target (schemars tagged-enum pattern)", () => {
    // Exactly PipelineCommand's shape: { type, properties: {type: {const}}, required: ["type"], $ref }.
    const defs = {
      BlurSettings: {
        type: "object",
        description: "Smooths an image.",
        properties: { kernelSize: { type: "integer", default: 3 } },
      },
    } satisfies Record<string, JsonSchema>;

    const variant: JsonSchema = {
      type: "object",
      properties: { type: { type: "string", const: "blur" } },
      required: ["type"],
      $ref: "#/$defs/BlurSettings",
    };

    const resolved = resolveSchema(variant, defs);

    expect(resolved.$ref).toBeUndefined();
    expect(resolved.properties).toEqual({
      kernelSize: { type: "integer", default: 3 },
      type: { type: "string", const: "blur" },
    });
    expect(resolved.required).toEqual(["type"]);
    // Overlay (the variant node) has no description of its own, so the
    // base def's description should show through.
    expect(resolved.description).toBe("Smooths an image.");
  });

  it("unions required arrays from both base and overlay without duplicates", () => {
    const defs = {
      Base: { type: "object", required: ["a", "shared"], properties: {} },
    } satisfies Record<string, JsonSchema>;
    const resolved = resolveSchema({ $ref: "#/$defs/Base", required: ["b", "shared"] }, defs);
    expect(resolved.required).toEqual(expect.arrayContaining(["a", "b", "shared"]));
    expect(resolved.required).toHaveLength(3);
  });

  it("prefers the overlay's default over the base's when both are set", () => {
    const defs = { Base: { type: "integer", default: 1 } } satisfies Record<string, JsonSchema>;
    const resolved = resolveSchema({ $ref: "#/$defs/Base", default: 2 }, defs);
    expect(resolved.default).toBe(2);
  });

  it("falls back to the base's default when the overlay has none", () => {
    const defs = { Base: { type: "integer", default: 1 } } satisfies Record<string, JsonSchema>;
    const resolved = resolveSchema({ $ref: "#/$defs/Base" }, defs);
    expect(resolved.default).toBe(1);
  });

  it("follows chained $refs", () => {
    const defs = {
      A: { $ref: "#/$defs/B" },
      B: { type: "string", default: "from-b" },
    } satisfies Record<string, JsonSchema>;
    const resolved = resolveSchema({ $ref: "#/$defs/A" }, defs);
    expect(resolved).toEqual({ type: "string", default: "from-b" });
  });

  it("throws for a $ref to a nonexistent def", () => {
    expect(() => resolveSchema({ $ref: "#/$defs/Missing" }, {})).toThrow(/Unknown schema definition/);
  });

  it("throws for a $ref that isn't a #/$defs/ pointer", () => {
    expect(() => resolveSchema({ $ref: "https://example.com/schema.json" }, {})).toThrow(/Unsupported \$ref target/);
  });
});
