import * as vscode from "vscode";
import { resolveSchema } from "../schema/resolve";
import type { JsonSchema } from "../schema/types";

/** Thrown when the user backs out of the wizard (Esc on a required prompt). */
export class WizardCancelled extends Error {
  constructor() {
    super("EVAnalyzer file creation was cancelled.");
  }
}

/**
 * Walks a JSON Schema (2020-12) document and interactively builds a value
 * that satisfies it, prompting the user only for required fields plus
 * whichever optional fields they choose to add.
 */
export async function runWizard(
  rootSchema: JsonSchema,
  defs: Record<string, JsonSchema>,
  rootLabel: string
): Promise<Record<string, unknown>> {
  const result = await promptForSchema(rootSchema, defs, rootLabel);
  if (typeof result !== "object" || result === null) {
    throw new Error(`Expected ${rootLabel} to resolve to an object.`);
  }
  return result as Record<string, unknown>;
}

async function promptForSchema(schema: JsonSchema, defs: Record<string, JsonSchema>, label: string): Promise<unknown> {
  const resolved = resolveSchema(schema, defs);

  if (resolved.const !== undefined) {
    return resolved.const;
  }
  if (resolved.enum && resolved.enum.length === 1) {
    return resolved.enum[0];
  }
  if (resolved.oneOf) {
    return pickVariant(resolved.oneOf, defs, label);
  }
  if (resolved.anyOf) {
    // schemars emits `anyOf: [T, {"type": "null"}]` for Rust's `Option<T>`.
    return pickVariant(resolved.anyOf, defs, label);
  }
  if (resolved.type === "object" || resolved.properties) {
    return promptObject(resolved, defs, label);
  }
  if (resolved.type === "array") {
    return promptArray(resolved, defs, label);
  }
  if (resolved.type === "string") {
    return promptString(resolved, label);
  }
  if (resolved.type === "integer" || resolved.type === "number") {
    return promptNumber(resolved, label);
  }
  if (resolved.type === "boolean") {
    return promptBoolean(resolved, label);
  }

  return resolved.default ?? null;
}

interface VariantPickItem extends vscode.QuickPickItem {
  variant: JsonSchema;
}

/** Shared by `oneOf` (tagged Rust enums) and `anyOf` (nullable `Option<T>`). */
async function pickVariant(variants: JsonSchema[], defs: Record<string, JsonSchema>, label: string): Promise<unknown> {
  const items: VariantPickItem[] = variants.map((variant, index) => {
    const resolvedVariant = resolveSchema(variant, defs);
    return {
      label: variantTag(resolvedVariant, index),
      description: firstLine(resolvedVariant.description),
      variant: resolvedVariant,
    };
  });

  if (items.length === 1) {
    return promptForSchema(items[0].variant, defs, label);
  }

  const picked = await vscode.window.showQuickPick(items, {
    placeHolder: `${label}: choose a variant`,
    ignoreFocusOut: true,
  });
  if (!picked) {
    throw new WizardCancelled();
  }

  if (picked.variant.type === "null") {
    return null;
  }
  return promptForSchema(picked.variant, defs, label);
}

function variantTag(resolved: JsonSchema, index: number): string {
  if (resolved.type === "null") {
    return "$(circle-slash) (none)";
  }
  const typeConst = resolved.properties?.type?.const;
  if (typeof typeConst === "string") {
    return typeConst;
  }
  if (resolved.const !== undefined) {
    return String(resolved.const);
  }
  if (resolved.enum && resolved.enum.length > 0) {
    return String(resolved.enum[0]);
  }
  if (resolved.title) {
    return resolved.title;
  }
  return `Option ${index + 1}`;
}

interface OptionalFieldPickItem extends vscode.QuickPickItem {
  key: string | null;
}

async function promptObject(schema: JsonSchema, defs: Record<string, JsonSchema>, label: string): Promise<unknown> {
  const properties = schema.properties ?? {};
  const required = schema.required ?? [];
  const result: Record<string, unknown> = {};

  for (const key of required) {
    const propSchema = properties[key];
    if (!propSchema) {
      continue;
    }
    const resolvedProp = resolveSchema(propSchema, defs);
    if (resolvedProp.const !== undefined) {
      result[key] = resolvedProp.const;
      continue;
    }
    if (resolvedProp.type === "string" && resolvedProp.format === "date-time") {
      result[key] = new Date().toISOString();
      continue;
    }
    result[key] = await promptForSchema(propSchema, defs, describeField(key, resolvedProp));
  }

  let optionalKeys = Object.keys(properties).filter((key) => !required.includes(key));
  while (optionalKeys.length > 0) {
    const items: OptionalFieldPickItem[] = [
      ...optionalKeys.map((key) => ({
        label: `$(add) ${key}`,
        description: firstLine(resolveSchema(properties[key], defs).description),
        key,
      })),
      { label: "$(check) Done", key: null },
    ];

    const picked = await vscode.window.showQuickPick(items, {
      placeHolder: `${label}: add an optional field? (Esc to finish)`,
      ignoreFocusOut: true,
    });
    if (!picked || picked.key === null) {
      break;
    }

    const key = picked.key;
    result[key] = await promptForSchema(properties[key], defs, describeField(key, resolveSchema(properties[key], defs)));
    optionalKeys = optionalKeys.filter((k) => k !== key);
  }

  return result;
}

async function promptArray(schema: JsonSchema, defs: Record<string, JsonSchema>, label: string): Promise<unknown> {
  const itemSchema = schema.items;
  if (!itemSchema) {
    return [];
  }
  const minItems = schema.minItems ?? 0;
  const maxItems = schema.maxItems;
  const result: unknown[] = [];

  while (true) {
    const mustAdd = result.length < minItems;
    if (!mustAdd) {
      if (maxItems !== undefined && result.length >= maxItems) {
        break;
      }
      const choice = await vscode.window.showQuickPick(
        [
          { label: "$(add) Add item", add: true },
          { label: "$(check) Done", add: false },
        ],
        { placeHolder: `${label}: ${result.length} item(s) so far. Add another?`, ignoreFocusOut: true }
      );
      if (!choice || !choice.add) {
        break;
      }
    }
    const item = await promptForSchema(itemSchema, defs, `${label}[${result.length}]`);
    result.push(item);
  }

  return result;
}

async function promptString(schema: JsonSchema, label: string): Promise<unknown> {
  if (schema.enum && schema.enum.length > 0) {
    const items = schema.enum.map((value) => ({ label: String(value) }));
    const picked = await vscode.window.showQuickPick(items, { placeHolder: label, ignoreFocusOut: true });
    if (!picked) {
      throw new WizardCancelled();
    }
    return picked.label;
  }

  const hasDefault = schema.default !== undefined;
  const value = await vscode.window.showInputBox({
    prompt: label,
    value: typeof schema.default === "string" ? schema.default : undefined,
    ignoreFocusOut: true,
    validateInput: (v) => (v.length === 0 && !hasDefault ? "This field is required." : undefined),
  });
  if (value === undefined) {
    throw new WizardCancelled();
  }
  if (value.length === 0 && hasDefault) {
    return schema.default;
  }
  return value;
}

async function promptNumber(schema: JsonSchema, label: string): Promise<unknown> {
  const isInteger = schema.type === "integer";
  const hasDefault = schema.default !== undefined;

  const value = await vscode.window.showInputBox({
    prompt: label,
    value: hasDefault ? String(schema.default) : undefined,
    ignoreFocusOut: true,
    validateInput: (v) => {
      if (v.trim().length === 0) {
        return hasDefault ? undefined : "This field is required.";
      }
      const n = Number(v);
      if (Number.isNaN(n)) {
        return "Must be a number.";
      }
      if (isInteger && !Number.isInteger(n)) {
        return "Must be an integer.";
      }
      if (schema.minimum !== undefined && n < schema.minimum) {
        return `Must be >= ${schema.minimum}.`;
      }
      if (schema.maximum !== undefined && n > schema.maximum) {
        return `Must be <= ${schema.maximum}.`;
      }
      return undefined;
    },
  });
  if (value === undefined) {
    throw new WizardCancelled();
  }
  if (value.trim().length === 0) {
    return schema.default;
  }
  return Number(value);
}

async function promptBoolean(schema: JsonSchema, label: string): Promise<unknown> {
  const items = [
    { label: "true", value: true },
    { label: "false", value: false },
  ];
  const picked = await vscode.window.showQuickPick(items, {
    placeHolder: `${label}${schema.default !== undefined ? ` (default: ${schema.default})` : ""}`,
    ignoreFocusOut: true,
  });
  if (!picked) {
    throw new WizardCancelled();
  }
  return picked.value;
}

function describeField(key: string, schema: JsonSchema): string {
  const desc = firstLine(schema.description);
  return desc ? `${key} — ${desc}` : key;
}

function firstLine(description: string | undefined): string | undefined {
  if (!description) {
    return undefined;
  }
  const line = description.split("\n")[0].trim();
  return line.length > 0 ? line : undefined;
}
