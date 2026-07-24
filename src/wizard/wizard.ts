import * as vscode from "vscode";
import { resolveSchema } from "../schema/resolve";
import type { JsonSchema } from "../schema/types";

/** Thrown only when the user backs out of the very first prompt of a wizard run. */
export class WizardCancelled extends Error {
  constructor() {
    super("EVAnalyzer file creation was cancelled.");
  }
}

const DONE_BUTTON = new vscode.ThemeIcon("check-all");
const FAST_FORWARD_LABEL = "$(check-all) Done - fill everything else with defaults";

/** Tracks whether any prompt has been answered yet, and whether the user hit "fill the rest with defaults". */
interface WizardState {
  started: boolean;
  fastForward: boolean;
}

/**
 * Walks a JSON Schema (2020-12) document and interactively builds a value
 * that satisfies it, prompting for required fields plus whichever optional
 * fields the user chooses to add.
 *
 * Two ways to shortcut this:
 * - Every prompt offers a "Done - fill everything else with defaults" choice
 *   (a QuickPick item, or a title-bar button on text/number inputs). Picking
 *   it immediately finishes the *entire* wizard, filling every remaining
 *   field - however deeply nested - with its schema default or a
 *   type-appropriate empty/zero value, with no further prompts at all.
 * - Cancelling (Esc) a single prompt only skips *that* field the same way,
 *   and the wizard keeps going - except Esc on the very first prompt of a
 *   run aborts the whole thing (the "I didn't mean to click this" case).
 */
export async function runWizard(
  rootSchema: JsonSchema,
  defs: Record<string, JsonSchema>,
  rootLabel: string
): Promise<Record<string, unknown>> {
  const state: WizardState = { started: false, fastForward: false };
  const result = await promptForSchema(rootSchema, defs, rootLabel, state);
  if (typeof result !== "object" || result === null) {
    throw new Error(`Expected ${rootLabel} to resolve to an object.`);
  }
  return result as Record<string, unknown>;
}

async function promptForSchema(schema: JsonSchema, defs: Record<string, JsonSchema>, label: string, state: WizardState): Promise<unknown> {
  const resolved = resolveSchema(schema, defs);

  if (resolved.const !== undefined) {
    return resolved.const;
  }
  if (resolved.enum && resolved.enum.length === 1) {
    return resolved.enum[0];
  }
  if (resolved.oneOf) {
    return pickVariant(resolved.oneOf, defs, label, state);
  }
  if (resolved.anyOf) {
    // schemars emits `anyOf: [T, {"type": "null"}]` for Rust's `Option<T>`.
    return pickVariant(resolved.anyOf, defs, label, state);
  }
  if (resolved.type === "object" || resolved.properties) {
    return promptObject(resolved, defs, label, state);
  }
  if (resolved.type === "array") {
    return promptArray(resolved, defs, label, state);
  }
  if (resolved.type === "string") {
    return promptString(resolved, label, state);
  }
  if (resolved.type === "integer" || resolved.type === "number") {
    return promptNumber(resolved, label, state);
  }
  if (resolved.type === "boolean") {
    return promptBoolean(resolved, label, state);
  }

  return resolved.default ?? null;
}

/** Call at the top of every leaf prompt, before showing UI, to know whether it should even show UI. */
function beginPrompt(state: WizardState): { isFirst: boolean; skip: boolean } {
  const isFirst = !state.started;
  state.started = true;
  return { isFirst, skip: state.fastForward };
}

function onCancelled(isFirst: boolean): void {
  if (isFirst) {
    throw new WizardCancelled();
  }
}

interface VariantPickItem extends vscode.QuickPickItem {
  variant: JsonSchema | null; // null marks the "fast forward" sentinel item
}

/** Shared by `oneOf` (tagged Rust enums) and `anyOf` (nullable `Option<T>`). */
async function pickVariant(variants: JsonSchema[], defs: Record<string, JsonSchema>, label: string, state: WizardState): Promise<unknown> {
  const variantItems: VariantPickItem[] = variants.map((variant, index) => {
    const resolvedVariant = resolveSchema(variant, defs);
    return {
      label: variantTag(resolvedVariant, index),
      description: firstLine(resolvedVariant.description),
      variant: resolvedVariant,
    };
  });

  const fallback = () => {
    // Least commitment: prefer the null branch (anyOf-nullable) if there is
    // one, else the first declared variant.
    const nullItem = variantItems.find((item) => item.variant?.type === "null");
    const target = nullItem ?? variantItems[0];
    return target.variant?.type === "null" ? null : target.variant;
  };

  if (variantItems.length === 1) {
    return promptForSchema(variantItems[0].variant as JsonSchema, defs, label, state);
  }

  const { isFirst, skip } = beginPrompt(state);
  if (skip) {
    const target = fallback();
    return target === null ? null : promptForSchema(target, defs, label, state);
  }

  const items: VariantPickItem[] = [
    ...variantItems,
    { label: "", kind: vscode.QuickPickItemKind.Separator, variant: null },
    { label: FAST_FORWARD_LABEL, variant: null },
  ];

  const picked = await vscode.window.showQuickPick(items, {
    placeHolder: `${label}: choose a variant`,
    ignoreFocusOut: true,
  });

  if (picked?.label === FAST_FORWARD_LABEL) {
    state.fastForward = true;
    const target = fallback();
    return target === null ? null : promptForSchema(target, defs, label, state);
  }
  if (!picked) {
    onCancelled(isFirst);
    const target = fallback();
    return target === null ? null : promptForSchema(target, defs, label, state);
  }

  if (picked.variant?.type === "null") {
    return null;
  }
  return promptForSchema(picked.variant as JsonSchema, defs, label, state);
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
  fastForward?: boolean;
}

async function promptObject(schema: JsonSchema, defs: Record<string, JsonSchema>, label: string, state: WizardState): Promise<unknown> {
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
    result[key] = await promptForSchema(propSchema, defs, describeField(key, resolvedProp), state);
  }

  let optionalKeys = Object.keys(properties).filter((key) => !required.includes(key));
  while (optionalKeys.length > 0) {
    if (state.fastForward) {
      // Fast-forwarded: still include optional fields that have a schema
      // default (the same fields the "Fill in default values" Quick Fix
      // would add), since "fill everything else with defaults" should mean
      // exactly that. Optional fields with no default are left out - they
      // were never required, and there's nothing to fill without asking.
      for (const key of optionalKeys) {
        const resolved = resolveSchema(properties[key], defs);
        if (resolved.default !== undefined) {
          result[key] = resolved.default;
        }
      }
      break;
    }

    const items: OptionalFieldPickItem[] = [
      ...optionalKeys.map((key) => ({
        label: `$(add) ${key}`,
        description: firstLine(resolveSchema(properties[key], defs).description),
        key,
      })),
      { label: "$(check) Done", key: null },
      { label: "", kind: vscode.QuickPickItemKind.Separator, key: null },
      { label: FAST_FORWARD_LABEL, key: null, fastForward: true },
    ];

    const picked = await vscode.window.showQuickPick(items, {
      placeHolder: `${label}: add an optional field? (Esc to finish)`,
      ignoreFocusOut: true,
    });
    if (picked?.fastForward) {
      state.fastForward = true;
      break;
    }
    if (!picked || picked.key === null) {
      break;
    }

    const key = picked.key;
    result[key] = await promptForSchema(properties[key], defs, describeField(key, resolveSchema(properties[key], defs)), state);
    optionalKeys = optionalKeys.filter((k) => k !== key);
  }

  return result;
}

async function promptArray(schema: JsonSchema, defs: Record<string, JsonSchema>, label: string, state: WizardState): Promise<unknown> {
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
      if (state.fastForward || (maxItems !== undefined && result.length >= maxItems)) {
        break;
      }
      const choice = await vscode.window.showQuickPick(
        [
          { label: "$(add) Add item", add: true, fastForward: false },
          { label: "$(check) Done", add: false, fastForward: false },
          { label: "", kind: vscode.QuickPickItemKind.Separator, add: false, fastForward: false },
          { label: FAST_FORWARD_LABEL, add: false, fastForward: true },
        ],
        { placeHolder: `${label}: ${result.length} item(s) so far. Add another?`, ignoreFocusOut: true }
      );
      if (choice?.fastForward) {
        state.fastForward = true;
        break;
      }
      if (!choice || !choice.add) {
        break;
      }
    }
    const item = await promptForSchema(itemSchema, defs, `${label}[${result.length}]`, state);
    result.push(item);
  }

  return result;
}

async function promptString(schema: JsonSchema, label: string, state: WizardState): Promise<unknown> {
  if (schema.enum && schema.enum.length > 0) {
    const { isFirst, skip } = beginPrompt(state);
    if (skip) {
      return schema.default ?? schema.enum[0];
    }

    const items = [
      ...schema.enum.map((value) => ({ label: String(value) })),
      { label: "", kind: vscode.QuickPickItemKind.Separator },
      { label: FAST_FORWARD_LABEL },
    ];
    const picked = await vscode.window.showQuickPick(items, { placeHolder: label, ignoreFocusOut: true });
    if (picked?.label === FAST_FORWARD_LABEL) {
      state.fastForward = true;
      return schema.default ?? schema.enum[0];
    }
    if (!picked) {
      onCancelled(isFirst);
      return schema.default ?? schema.enum[0];
    }
    return picked.label;
  }

  const hasDefault = schema.default !== undefined;
  const { isFirst, skip } = beginPrompt(state);
  if (skip) {
    return schema.default ?? "";
  }

  const { value, fastForward } = await showInputBoxWithFastForward({
    prompt: label,
    value: typeof schema.default === "string" ? schema.default : undefined,
  });
  if (fastForward) {
    state.fastForward = true;
  }
  if (value === undefined) {
    onCancelled(isFirst);
    return schema.default ?? "";
  }
  if (value.length === 0 && hasDefault) {
    return schema.default;
  }
  return value;
}

async function promptNumber(schema: JsonSchema, label: string, state: WizardState): Promise<unknown> {
  const isInteger = schema.type === "integer";
  const hasDefault = schema.default !== undefined;

  const { isFirst, skip } = beginPrompt(state);
  if (skip) {
    return hasDefault ? schema.default : zeroNumber(schema);
  }

  const validate = (v: string) => {
    if (v.trim().length === 0) {
      return undefined; // empty is allowed - treated as "skip" below, same as Esc.
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
  };

  const { value, fastForward } = await showInputBoxWithFastForward({
    prompt: label,
    value: hasDefault ? String(schema.default) : undefined,
    validateInput: validate,
  });
  if (fastForward) {
    state.fastForward = true;
  }
  if (value === undefined) {
    onCancelled(isFirst);
    return zeroNumber(schema);
  }
  if (value.trim().length === 0) {
    return hasDefault ? schema.default : zeroNumber(schema);
  }
  return Number(value);
}

function zeroNumber(schema: JsonSchema): number {
  return typeof schema.default === "number" ? schema.default : 0;
}

async function promptBoolean(schema: JsonSchema, label: string, state: WizardState): Promise<unknown> {
  const { isFirst, skip } = beginPrompt(state);
  if (skip) {
    return typeof schema.default === "boolean" ? schema.default : false;
  }

  const items = [
    { label: "true", value: true },
    { label: "false", value: false },
    { label: "", kind: vscode.QuickPickItemKind.Separator, value: undefined },
    { label: FAST_FORWARD_LABEL, value: undefined },
  ];
  const picked = await vscode.window.showQuickPick(items, {
    placeHolder: `${label}${schema.default !== undefined ? ` (default: ${schema.default})` : ""}`,
    ignoreFocusOut: true,
  });
  if (picked?.label === FAST_FORWARD_LABEL) {
    state.fastForward = true;
    return typeof schema.default === "boolean" ? schema.default : false;
  }
  if (!picked) {
    onCancelled(isFirst);
    return typeof schema.default === "boolean" ? schema.default : false;
  }
  return picked.value;
}

/**
 * `vscode.window.showInputBox` has no way to add a custom button, so text
 * and number prompts use the lower-level `createInputBox` API instead, with
 * a "fill everything else with defaults" button in the title bar.
 */
function showInputBoxWithFastForward(options: {
  prompt: string;
  value?: string;
  validateInput?: (value: string) => string | undefined;
}): Promise<{ value: string | undefined; fastForward: boolean }> {
  return new Promise((resolve) => {
    const box = vscode.window.createInputBox();
    box.prompt = options.prompt;
    box.value = options.value ?? "";
    box.ignoreFocusOut = true;
    box.buttons = [{ iconPath: DONE_BUTTON, tooltip: "Done - fill everything else with defaults" }];

    let resolved = false;
    const finish = (result: { value: string | undefined; fastForward: boolean }) => {
      if (resolved) {
        return;
      }
      resolved = true;
      box.dispose();
      resolve(result);
    };

    if (options.validateInput) {
      box.onDidChangeValue((value) => {
        box.validationMessage = options.validateInput!(value);
      });
    }
    box.onDidTriggerButton(() => finish({ value: box.value, fastForward: true }));
    box.onDidAccept(() => {
      if (box.validationMessage) {
        return;
      }
      finish({ value: box.value, fastForward: false });
    });
    box.onDidHide(() => finish({ value: undefined, fastForward: false }));
    box.show();
  });
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
