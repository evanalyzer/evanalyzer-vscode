import { findNodeAtLocation, getNodeValue, type Node as JsoncNode } from "jsonc-parser";
import { mergeSchemas, resolveSchema, splitVariants, variantDiscriminator } from "./resolve";
import type { JsonSchema } from "./types";

export type JsonPath = (string | number)[];

/**
 * Resolves the effective schema for the value at `path` within `tree`,
 * picking oneOf/anyOf branches from the document's actual data instead of
 * prompting (this is the wizard's resolution, driven by existing content
 * rather than user input).
 *
 * Understands the discriminator shapes these schemas actually use:
 * schemars' internally-tagged `properties.type.const` pattern (used by
 * PipelineCommand and similar), externally tagged variants recognised by
 * their single required key (`{"command": ...}` / `{"component": ...}`,
 * `{"GLOBAL": 3}`), and `anyOf: [T, {type: "null"}]` for Rust's
 * `Option<T>`. A branch that uses none of them (e.g. a bare string/const
 * enum variant) is left unresolved - that just means no defaultable
 * properties are found there, not a crash.
 */
export function schemaAtPath(
  root: JsonSchema,
  defs: Record<string, JsonSchema>,
  tree: JsoncNode,
  path: JsonPath
): JsonSchema | undefined {
  let schema: JsonSchema | undefined = resolveSchema(root, defs);

  for (let i = 0; i <= path.length; i++) {
    if (!schema) {
      return undefined;
    }
    schema = selectBranch(schema, defs, tree, path.slice(0, i));
    if (!schema) {
      return undefined;
    }
    if (i === path.length) {
      break;
    }

    const segment = path[i];
    if (typeof segment === "number") {
      if (!schema.items) {
        return undefined;
      }
      schema = resolveSchema(schema.items, defs);
    } else {
      const propSchema = schema.properties?.[segment];
      if (!propSchema) {
        return undefined;
      }
      schema = resolveSchema(propSchema, defs);
    }
  }

  return schema;
}

function selectBranch(schema: JsonSchema, defs: Record<string, JsonSchema>, tree: JsoncNode, path: JsonPath): JsonSchema | undefined {
  const { base, variants } = splitVariants(schema);
  if (!variants) {
    return schema;
  }

  const actual = valueAt(tree, path);
  const selected = pickBranch(schema, variants, defs, actual);
  if (!base) {
    return selected;
  }
  // Shared fields next to the variants (PipelineStepSettings' id/enabled):
  // still usable before a variant is chosen, and merged into it after.
  return selected ? mergeSchemas(base, selected) : base;
}

function pickBranch(schema: JsonSchema, variants: JsonSchema[], defs: Record<string, JsonSchema>, actual: unknown): JsonSchema | undefined {
  if (schema.anyOf && variants.length === 2) {
    const nullVariant = variants.find((v) => resolveSchema(v, defs).type === "null");
    const otherVariant = variants.find((v) => v !== nullVariant);
    if (nullVariant && otherVariant) {
      return actual === null ? resolveSchema(nullVariant, defs) : resolveSchema(otherVariant, defs);
    }
  }

  for (const variant of variants) {
    const resolved = resolveSchema(variant, defs);
    if (matchesDiscriminator(resolved, actual)) {
      return resolved;
    }
  }
  return undefined;
}

function matchesDiscriminator(resolved: JsonSchema, actual: unknown): boolean {
  const discriminator = variantDiscriminator(resolved);
  if (!discriminator || typeof actual !== "object" || actual === null) {
    // No recognized discriminator on this branch - can't tell from `actual`.
    return false;
  }
  const record = actual as Record<string, unknown>;
  return discriminator.kind === "typeConst" ? record.type === discriminator.value : discriminator.value in record;
}

function valueAt(tree: JsoncNode, path: JsonPath): unknown {
  if (path.length === 0) {
    return getNodeValue(tree);
  }
  const node = findNodeAtLocation(tree, path);
  return node ? getNodeValue(node) : undefined;
}
