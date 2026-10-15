import { findNodeAtLocation, getNodeValue, type Node as JsoncNode } from "jsonc-parser";
import type { JsonPath } from "../schema/schemaAtPath";

export interface ComponentParameterInfo {
  key: string;
  label: string;
  description: string;
  default: unknown;
}

export interface ComponentDefinitionInfo {
  key: string;
  /** Path of the definition object (`["components", 2]`, `["uses", 0]`, or `[]` for a `.evacomp` root). */
  path: JsonPath;
  name: string | undefined;
  shortDescription: string | undefined;
  parameters: ComponentParameterInfo[];
  /** `[id, command type or component key]` of each step, in order. */
  steps: Array<{ id: number | undefined; summary: string }>;
  classIds: number[];
}

/**
 * The component definitions a file's steps can use: `components` in
 * projects/templates, `uses` in `.evacomp` (a `.evacomp` root is the
 * component being defined, not one its own steps can use).
 */
export function componentDefinitions(tree: JsoncNode, isComponentFile: boolean): ComponentDefinitionInfo[] {
  const arrayKey = isComponentFile ? "uses" : "components";
  const definitions = valueAt(tree, [arrayKey]);
  if (!Array.isArray(definitions)) {
    return [];
  }
  const result: ComponentDefinitionInfo[] = [];
  definitions.forEach((definition, index) => {
    const info = describeDefinition(definition, [arrayKey, index]);
    if (info) {
      result.push(info);
    }
  });
  return result;
}

export function findComponentDefinition(tree: JsoncNode, key: string, isComponentFile: boolean): ComponentDefinitionInfo | undefined {
  return componentDefinitions(tree, isComponentFile).find((definition) => definition.key === key);
}

/** The definition at `path` - also the `.evacomp` root itself (`[]`), which `componentDefinitions` leaves out. */
export function describeDefinition(value: unknown, path: JsonPath): ComponentDefinitionInfo | undefined {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    return undefined;
  }
  const record = value as Record<string, unknown>;
  if (typeof record.key !== "string") {
    return undefined;
  }
  const meta = asRecord(record.meta);

  const parameters: ComponentParameterInfo[] = [];
  for (const parameter of asArray(record.parameters)) {
    const p = asRecord(parameter);
    if (typeof p?.key === "string") {
      parameters.push({
        key: p.key,
        label: typeof p.label === "string" ? p.label : p.key,
        description: typeof p.description === "string" ? p.description : "",
        default: p.default,
      });
    }
  }

  const steps = asArray(record.steps).map((step) => {
    const s = asRecord(step);
    const command = asRecord(s?.command);
    const component = asRecord(s?.component);
    const summary =
      typeof command?.type === "string" ? command.type : typeof component?.key === "string" ? `component ${component.key}` : "step";
    return { id: typeof s?.id === "number" ? s.id : undefined, summary };
  });

  const classIds = asArray(record.classes)
    .map((c) => asRecord(c)?.id)
    .filter((id): id is number => typeof id === "number");

  return {
    key: record.key,
    path,
    name: typeof meta?.name === "string" && meta.name.length > 0 ? meta.name : undefined,
    shortDescription: typeof meta?.shortDescription === "string" && meta.shortDescription.length > 0 ? meta.shortDescription : undefined,
    parameters,
    steps,
    classIds,
  };
}

export function valueAt(tree: JsoncNode, path: JsonPath): unknown {
  if (path.length === 0) {
    return getNodeValue(tree);
  }
  const node = findNodeAtLocation(tree, path);
  return node ? getNodeValue(node) : undefined;
}

function asRecord(value: unknown): Record<string, unknown> | undefined {
  return typeof value === "object" && value !== null && !Array.isArray(value) ? (value as Record<string, unknown>) : undefined;
}

function asArray(value: unknown): unknown[] {
  return Array.isArray(value) ? value : [];
}
