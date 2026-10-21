import { findNodeAtLocation, getNodeValue, type Node as JsoncNode } from "jsonc-parser";
import type { JsonPath } from "../schema/schemaAtPath";

export interface ModuleParameterInfo {
  key: string;
  label: string;
  description: string;
  default: unknown;
}

export interface ModuleDefinitionInfo {
  key: string;
  /** Path of the definition object (`["modules", 2]`, `["uses", 0]`, or `[]` for a `.evamodule` root). */
  path: JsonPath;
  name: string | undefined;
  shortDescription: string | undefined;
  parameters: ModuleParameterInfo[];
  /** `[id, command type or module key]` of each step, in order. */
  steps: Array<{ id: number | undefined; summary: string }>;
  classIds: number[];
}

/**
 * The module definitions a file's steps can use: `modules` in
 * projects/templates, `uses` in `.evamodule` (a `.evamodule` root is the
 * module being defined, not one its own steps can use).
 */
export function moduleDefinitions(tree: JsoncNode, isModuleFile: boolean): ModuleDefinitionInfo[] {
  const arrayKey = isModuleFile ? "uses" : "modules";
  const definitions = valueAt(tree, [arrayKey]);
  if (!Array.isArray(definitions)) {
    return [];
  }
  const result: ModuleDefinitionInfo[] = [];
  definitions.forEach((definition, index) => {
    const info = describeDefinition(definition, [arrayKey, index]);
    if (info) {
      result.push(info);
    }
  });
  return result;
}

export function findModuleDefinition(tree: JsoncNode, key: string, isModuleFile: boolean): ModuleDefinitionInfo | undefined {
  return moduleDefinitions(tree, isModuleFile).find((definition) => definition.key === key);
}

/** The definition at `path` - also the `.evamodule` root itself (`[]`), which `moduleDefinitions` leaves out. */
export function describeDefinition(value: unknown, path: JsonPath): ModuleDefinitionInfo | undefined {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    return undefined;
  }
  const record = value as Record<string, unknown>;
  if (typeof record.key !== "string") {
    return undefined;
  }
  const meta = asRecord(record.meta);

  const parameters: ModuleParameterInfo[] = [];
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
    const module = asRecord(s?.module);
    const summary =
      typeof command?.type === "string" ? command.type : typeof module?.key === "string" ? `module ${module.key}` : "step";
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
