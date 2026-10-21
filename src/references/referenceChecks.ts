import { findNodeAtLocation, getNodePath, getNodeValue, type Node as JsoncNode } from "jsonc-parser";
import type { JsonPath } from "../schema/schemaAtPath";
import { moduleDefinitions, describeDefinition, type ModuleDefinitionInfo } from "./moduleIndex";

export type IssueSeverity = "error" | "warning";

export interface ReferenceIssue {
  offset: number;
  length: number;
  message: string;
  severity: IssueSeverity;
}

/**
 * Cross-reference checks JSON Schema can't express - everything here is
 * "this value must match something defined elsewhere in the file":
 *
 * - a module step's `key` names a defined module (and not the
 *   module the step belongs to), and its `values` only set parameters
 *   that module has;
 * - a module parameter's bindings point at a step id of that module;
 * - ids/keys that must be unique in their list (class ids, pipeline ids,
 *   step ids, module keys, parameter keys) are;
 * - `{"LOCAL": n}` classes are only used inside a module definition
 *   that has local class `n`, and `{"GLOBAL": n}` classes in a project or
 *   project template exist in `classification.classes` (not checked in a
 *   `.evamodule`, whose global classes belong to whichever project it's
 *   inserted into).
 *
 * Severity follows how evanalyzer itself treats the problem on load: a
 * duplicate step id in a pipeline is renumbered (warning), the same in a
 * module definition is a load error, since its bindings refer to steps
 * by id.
 */
export function checkReferences(tree: JsoncNode, isModuleFile: boolean): ReferenceIssue[] {
  const issues: ReferenceIssue[] = [];
  const usable = new Map(moduleDefinitions(tree, isModuleFile).map((d) => [d.key, d]));
  const scopes = definitionScopes(tree, isModuleFile);

  checkUnique(tree, [isModuleFile ? "uses" : "modules"], "key", "module key", issues);
  for (const scope of scopes) {
    checkUnique(tree, [...scope.path, "classes"], "id", "class id", issues);
    checkUnique(tree, [...scope.path, "parameters"], "key", "parameter key", issues);
    checkSteps(tree, [...scope.path, "steps"], usable, scope, "error", issues);
    checkBindings(tree, scope, issues);
  }

  if (!isModuleFile) {
    checkUnique(tree, ["classification", "classes"], "id", "class id", issues);
    checkUnique(tree, ["pipelines"], "id", "pipeline id", issues);
    const pipelines = findNodeAtLocation(tree, ["pipelines"]);
    for (let i = 0; i < (pipelines?.children?.length ?? 0); i++) {
      checkSteps(tree, ["pipelines", i, "steps"], usable, undefined, "warning", issues);
    }
  }

  checkClassReferences(tree, isModuleFile, scopes, issues);
  return issues;
}

/** Every module definition in the file - including a `.evamodule` root - with the path it sits at. */
function definitionScopes(tree: JsoncNode, isModuleFile: boolean): ModuleDefinitionInfo[] {
  const scopes = moduleDefinitions(tree, isModuleFile);
  if (isModuleFile) {
    const root = describeDefinition(getNodeValue(tree), []);
    if (root) {
      scopes.unshift(root);
    }
  }
  return scopes;
}

function checkUnique(tree: JsoncNode, arrayPath: JsonPath, field: string, what: string, issues: ReferenceIssue[]): void {
  const seen = new Set<unknown>();
  for (const item of findNodeAtLocation(tree, arrayPath)?.children ?? []) {
    const valueNode = findNodeAtLocation(item, [field]);
    const value = valueNode ? getNodeValue(valueNode) : undefined;
    if (valueNode === undefined || value === "" || (typeof value !== "string" && typeof value !== "number")) {
      continue;
    }
    if (seen.has(value)) {
      issues.push(issueAt(valueNode, `Duplicate ${what} ${JSON.stringify(value)}.`, "error"));
    }
    seen.add(value);
  }
}

function checkSteps(
  tree: JsoncNode,
  stepsPath: JsonPath,
  usable: Map<string, ModuleDefinitionInfo>,
  owner: ModuleDefinitionInfo | undefined,
  duplicateIdSeverity: IssueSeverity,
  issues: ReferenceIssue[]
): void {
  const seenIds = new Set<number>();
  for (const step of findNodeAtLocation(tree, stepsPath)?.children ?? []) {
    const idNode = findNodeAtLocation(step, ["id"]);
    const id = idNode ? getNodeValue(idNode) : undefined;
    // 0 is StepId::UNASSIGNED - evanalyzer numbers those on load.
    if (idNode && typeof id === "number" && id !== 0) {
      if (seenIds.has(id)) {
        const message =
          duplicateIdSeverity === "error"
            ? `Duplicate step id ${id} - this module's parameter bindings can't tell which step they set.`
            : `Duplicate step id ${id} - evanalyzer renumbers it on load.`;
        issues.push(issueAt(idNode, message, duplicateIdSeverity));
      }
      seenIds.add(id);
    }

    const keyNode = findNodeAtLocation(step, ["module", "key"]);
    const key = keyNode ? getNodeValue(keyNode) : undefined;
    if (!keyNode || typeof key !== "string") {
      continue;
    }
    if (owner && key === owner.key) {
      issues.push(issueAt(keyNode, `Module "${key}" can't use itself.`, "error"));
      continue;
    }
    const definition = usable.get(key);
    if (!definition) {
      issues.push(issueAt(keyNode, `Unknown module "${key}".`, "error"));
      continue;
    }

    const parameterKeys = new Set(definition.parameters.map((p) => p.key));
    for (const property of findNodeAtLocation(step, ["module", "values"])?.children ?? []) {
      const nameNode = property.children?.[0];
      if (nameNode && typeof nameNode.value === "string" && !parameterKeys.has(nameNode.value)) {
        issues.push(issueAt(nameNode, `Module "${key}" has no parameter "${nameNode.value}".`, "warning"));
      }
    }
  }
}

function checkBindings(tree: JsoncNode, scope: ModuleDefinitionInfo, issues: ReferenceIssue[]): void {
  const stepIds = new Set(scope.steps.map((s) => s.id));
  for (const parameter of findNodeAtLocation(tree, [...scope.path, "parameters"])?.children ?? []) {
    for (const binding of findNodeAtLocation(parameter, ["bindings"])?.children ?? []) {
      const stepNode = findNodeAtLocation(binding, ["step"]);
      const step = stepNode ? getNodeValue(stepNode) : undefined;
      if (stepNode && typeof step === "number" && !stepIds.has(step)) {
        issues.push(issueAt(stepNode, `Module "${scope.key}" has no step with id ${step}.`, "error"));
      }
    }
  }
}

function checkClassReferences(tree: JsoncNode, isModuleFile: boolean, scopes: ModuleDefinitionInfo[], issues: ReferenceIssue[]): void {
  const globalIds = isModuleFile ? undefined : classIds(tree, ["classification", "classes"]);

  walk(tree, (node) => {
    if (node.type !== "object" || node.children?.length !== 1) {
      return;
    }
    const [property] = node.children;
    const [nameNode, valueNode] = property.children ?? [];
    if (!nameNode || !valueNode || valueNode.type !== "number") {
      return;
    }
    const id = valueNode.value as number;

    if (nameNode.value === "LOCAL") {
      const scope = innermostScope(scopes, getNodePath(node));
      if (!scope) {
        issues.push(issueAt(node, "LOCAL classes are only valid inside a module definition.", "error"));
      } else if (!scope.classIds.includes(id)) {
        issues.push(issueAt(valueNode, `Module "${scope.key}" has no local class with id ${id}.`, "warning"));
      }
    } else if (nameNode.value === "GLOBAL" && globalIds && !globalIds.has(id)) {
      issues.push(issueAt(valueNode, `No class with id ${id} in classification.classes.`, "warning"));
    }
  });
}

function innermostScope(scopes: ModuleDefinitionInfo[], path: JsonPath): ModuleDefinitionInfo | undefined {
  let best: ModuleDefinitionInfo | undefined;
  for (const scope of scopes) {
    const isPrefix = scope.path.every((segment, i) => path[i] === segment);
    if (isPrefix && (!best || scope.path.length > best.path.length)) {
      best = scope;
    }
  }
  return best;
}

function classIds(tree: JsoncNode, path: JsonPath): Set<number> {
  const ids = new Set<number>();
  for (const item of findNodeAtLocation(tree, path)?.children ?? []) {
    const idNode = findNodeAtLocation(item, ["id"]);
    if (idNode && typeof idNode.value === "number") {
      ids.add(idNode.value);
    }
  }
  return ids;
}

function issueAt(node: JsoncNode, message: string, severity: IssueSeverity): ReferenceIssue {
  return { offset: node.offset, length: node.length, message, severity };
}

function walk(node: JsoncNode, visit: (node: JsoncNode) => void): void {
  visit(node);
  for (const child of node.children ?? []) {
    walk(child, visit);
  }
}
