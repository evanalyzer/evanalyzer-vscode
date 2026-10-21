import { getLocation, parseTree, type Node as JsoncNode } from "jsonc-parser";
import { isStepsArray, owningModulePath } from "../schema/locations";
import type { JsonPath } from "../schema/schemaAtPath";
import { moduleDefinitions, describeDefinition, findModuleDefinition, valueAt } from "./moduleIndex";

export interface CompletionSuggestion {
  label: string;
  insertText: string;
  detail?: string;
  documentation?: string;
  /** Text to replace (the partially typed string/number), else insert at the cursor. */
  replace?: { offset: number; length: number };
}

/**
 * Completions for values that refer to something defined elsewhere in the
 * file, which the JSON Schema can only type as "a string"/"an integer":
 *
 * - a module step's `"key"` - the defined modules;
 * - a property name in a module step's `"values"` - that module's
 *   parameters (inserted with their default when nothing is typed yet);
 * - a parameter binding's `"step"` - the ids of the module's steps.
 */
export function moduleCompletions(text: string, offset: number, isModuleFile: boolean): CompletionSuggestion[] {
  const tree = parseTree(text);
  if (!tree) {
    return [];
  }
  const location = getLocation(text, offset);
  const path = location.path;
  const typed = location.previousNode;
  const replace = typed ? { offset: typed.offset, length: typed.length } : undefined;
  const at = (back: number) => path[path.length - back];

  // path: [...steps, i, "module", "key"]
  if (!location.isAtPropertyKey && at(1) === "key" && at(2) === "module" && isStepsArray(path.slice(0, -3), isModuleFile)) {
    return moduleKeySuggestions(tree, path.slice(0, -3), isModuleFile, replace);
  }
  // path: [...steps, i, "module", "values", <key being typed>]
  if (location.isAtPropertyKey && at(2) === "values" && at(3) === "module" && isStepsArray(path.slice(0, -4), isModuleFile)) {
    return parameterSuggestions(tree, path.slice(0, -2), isModuleFile, typed, replace);
  }
  // path: [...definition, "parameters", j, "bindings", k, "step"]
  if (!location.isAtPropertyKey && at(1) === "step" && at(3) === "bindings" && at(5) === "parameters") {
    return stepIdSuggestions(tree, path.slice(0, -5), replace);
  }
  return [];
}

function moduleKeySuggestions(
  tree: JsoncNode,
  stepsPath: JsonPath,
  isModuleFile: boolean,
  replace: CompletionSuggestion["replace"]
): CompletionSuggestion[] {
  const ownerPath = owningModulePath(stepsPath, isModuleFile);
  const ownKey = ownerPath ? valueAt(tree, [...ownerPath, "key"]) : undefined;
  return moduleDefinitions(tree, isModuleFile)
    .filter((definition) => definition.key !== ownKey)
    .map((definition) => ({
      label: definition.key,
      insertText: JSON.stringify(definition.key),
      detail: definition.name,
      documentation: definition.shortDescription,
      replace,
    }));
}

function parameterSuggestions(
  tree: JsoncNode,
  modulePath: JsonPath,
  isModuleFile: boolean,
  typed: JsoncNode | undefined,
  replace: CompletionSuggestion["replace"]
): CompletionSuggestion[] {
  const key = valueAt(tree, [...modulePath, "key"]);
  const definition = typeof key === "string" ? findModuleDefinition(tree, key, isModuleFile) : undefined;
  if (!definition) {
    return [];
  }
  const values = valueAt(tree, [...modulePath, "values"]);
  const alreadySet = new Set(typeof values === "object" && values !== null ? Object.keys(values) : []);
  if (typed && typeof typed.value === "string") {
    alreadySet.delete(typed.value); // the key being typed right now
  }

  return definition.parameters
    .filter((parameter) => !alreadySet.has(parameter.key))
    .map((parameter) => ({
      label: parameter.key,
      // Mid-key (inside quotes): just the name. On an empty spot: the whole
      // property, starting from the definition's default.
      insertText: typed ? JSON.stringify(parameter.key) : `${JSON.stringify(parameter.key)}: ${JSON.stringify(parameter.default ?? null)}`,
      detail: `${parameter.label} (default: ${JSON.stringify(parameter.default)})`,
      documentation: parameter.description || undefined,
      replace,
    }));
}

function stepIdSuggestions(tree: JsoncNode, definitionPath: JsonPath, replace: CompletionSuggestion["replace"]): CompletionSuggestion[] {
  const definition = describeDefinition(valueAt(tree, definitionPath), definitionPath);
  if (!definition) {
    return [];
  }
  return definition.steps
    .filter((step): step is { id: number; summary: string } => typeof step.id === "number" && step.id !== 0)
    .map((step) => ({ label: String(step.id), insertText: String(step.id), detail: step.summary, replace }));
}
