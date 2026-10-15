import * as vscode from "vscode";
import { applyEdits, findNodeAtLocation, findNodeAtOffset, getNodePath, getNodeValue, modify, parseTree, type Node as JsoncNode } from "jsonc-parser";
import { COMPONENT_TEMPLATE, fileTypeForFileName } from "../fileTypes";
import { findComponentDefinition } from "../references/componentIndex";
import { isClassArray, isPipelinesArray, isStepsArray } from "../schema/locations";
import { nextClassId, nextPipelineId, nextStepId } from "../schema/nextId";
import { resolveSchema } from "../schema/resolve";
import { schemaAtPath, type JsonPath } from "../schema/schemaAtPath";
import { loadSchema } from "../schema/schemaLoader";
import type { JsonSchema } from "../schema/types";

interface FillEntry {
  key: string;
  value: unknown;
}

/**
 * Offers a Quick Fix that inserts every not-yet-present property which has a
 * schema `default` (e.g. a command's optional settings once its `type` is
 * chosen). Properties that are `required` with no `default` are deliberately
 * left alone - those are exactly the ones VS Code's own JSON validation
 * already flags with a "Missing property" diagnostic, which is the intended
 * signal for "you must supply this yourself".
 *
 * Exceptions:
 * - `id` fields (`Class.id`, `PipelineSettings.id`, a step's `StepId`) have
 *   no usable static default (StepId's is 0, "unassigned"), but a "next
 *   unused id" is something we *can* compute from sibling array entries,
 *   so those get suggested instead.
 * - A component step's `values`: a second action fills in every parameter
 *   of the used component definition that isn't set yet, with that
 *   parameter's default - turning "uses the default" into an explicit,
 *   editable value.
 */
export class FillDefaultsCodeActionProvider implements vscode.CodeActionProvider {
  public static readonly metadata: vscode.CodeActionProviderMetadata = {
    providedCodeActionKinds: [vscode.CodeActionKind.QuickFix],
  };

  constructor(private readonly extensionPath: string) {}

  async provideCodeActions(
    document: vscode.TextDocument,
    range: vscode.Range | vscode.Selection,
    context: vscode.CodeActionContext
  ): Promise<vscode.CodeAction[]> {
    if (context.only && !context.only.contains(vscode.CodeActionKind.QuickFix)) {
      return [];
    }

    const fileType = fileTypeForFileName(document.fileName);
    if (!fileType) {
      return [];
    }

    const text = document.getText();
    const tree = parseTree(text);
    if (!tree) {
      return [];
    }

    const offset = document.offsetAt(range.start);
    let node = findNodeAtOffset(tree, offset, true);
    while (node && node.type !== "object") {
      node = node.parent;
    }
    if (!node) {
      return [];
    }

    const objectPath = getNodePath(node);
    const rootSchema = await loadSchema(this.extensionPath, fileType.schemaFile);
    const schema = schemaAtPath(rootSchema, rootSchema.$defs, tree, objectPath);
    if (!schema?.properties) {
      return [];
    }

    const existing = (getNodeValue(node) as Record<string, unknown> | undefined) ?? {};
    const existingKeys = new Set(Object.keys(existing));
    const isComponentFile = fileType === COMPONENT_TEMPLATE;

    const idSuggestion = computeIdSuggestion(objectPath, schema, existingKeys, tree, isComponentFile);
    const defaultable: FillEntry[] = Object.entries(schema.properties)
      .filter(([key]) => !(idSuggestion && key === idSuggestion.key))
      .map(([key, propSchema]) => [key, resolveSchema(propSchema, rootSchema.$defs)] as const)
      .filter(([key, resolved]) => !existingKeys.has(key) && resolved.default !== undefined)
      .map(([key, resolved]) => ({ key, value: resolved.default }));
    const missing = idSuggestion ? [...defaultable, idSuggestion] : defaultable;

    const actions: vscode.CodeAction[] = [];
    if (missing.length > 0) {
      const tag = schema.properties.type?.const;
      const title = typeof tag === "string" ? `Fill in default values for "${tag}"` : "Fill in default values";
      const action = new vscode.CodeAction(title, vscode.CodeActionKind.QuickFix);
      action.edit = buildFillEdit(document, text, objectPath, missing);
      action.isPreferred = true;
      actions.push(action);
    }

    const parameterFill = componentParameterFill(tree, objectPath, existing, isComponentFile);
    if (parameterFill) {
      const action = new vscode.CodeAction(parameterFill.title, vscode.CodeActionKind.QuickFix);
      action.edit = buildFillEdit(document, text, parameterFill.valuesPath, parameterFill.entries);
      actions.push(action);
    }
    return actions;
  }
}

function computeIdSuggestion(
  objectPath: JsonPath,
  schema: JsonSchema,
  existingKeys: Set<string>,
  tree: JsoncNode,
  isComponentFile: boolean
): FillEntry | undefined {
  if (existingKeys.has("id") || !schema.properties?.id || typeof objectPath[objectPath.length - 1] !== "number") {
    return undefined;
  }
  const arrayPath = objectPath.slice(0, -1);
  const siblings = valueAtPath(tree, arrayPath);

  if (isClassArray(arrayPath, isComponentFile)) {
    return { key: "id", value: nextClassId(siblings) };
  }
  if (isPipelinesArray(arrayPath, isComponentFile)) {
    return { key: "id", value: nextPipelineId(siblings) };
  }
  if (isStepsArray(arrayPath, isComponentFile)) {
    return { key: "id", value: nextStepId(siblings) };
  }
  return undefined;
}

/**
 * When the cursor is in a component step (`{"component": {...}}`), its
 * `component` object, or that object's `values`: the parameters of the
 * used definition that `values` doesn't set yet, with their defaults.
 */
function componentParameterFill(
  tree: JsoncNode,
  objectPath: JsonPath,
  objectValue: Record<string, unknown>,
  isComponentFile: boolean
): { title: string; valuesPath: JsonPath; entries: FillEntry[] } | undefined {
  let componentPath: JsonPath;
  if (objectPath[objectPath.length - 1] === "values" && objectPath[objectPath.length - 2] === "component") {
    componentPath = objectPath.slice(0, -1);
  } else if (objectPath[objectPath.length - 1] === "component") {
    componentPath = objectPath;
  } else if (objectValue.component !== undefined) {
    componentPath = [...objectPath, "component"];
  } else {
    return undefined;
  }
  if (!isStepsArray(componentPath.slice(0, -2), isComponentFile)) {
    return undefined;
  }

  const instance = valueAtPath(tree, componentPath) as Record<string, unknown> | undefined;
  const key = instance?.key;
  if (typeof key !== "string") {
    return undefined;
  }
  const definition = findComponentDefinition(tree, key, isComponentFile);
  if (!definition) {
    return undefined;
  }

  const values = (instance?.values as Record<string, unknown> | undefined) ?? {};
  const entries: FillEntry[] = definition.parameters
    .filter((parameter) => !(parameter.key in values))
    .map((parameter) => ({ key: parameter.key, value: parameter.default }));
  if (entries.length === 0) {
    return undefined;
  }
  return { title: `Fill in parameter values for component "${key}"`, valuesPath: [...componentPath, "values"], entries };
}

function valueAtPath(tree: JsoncNode, path: JsonPath): unknown {
  if (path.length === 0) {
    return getNodeValue(tree);
  }
  const node = findNodeAtLocation(tree, path);
  return node ? getNodeValue(node) : undefined;
}

function buildFillEdit(document: vscode.TextDocument, originalText: string, objectPath: JsonPath, missing: FillEntry[]): vscode.WorkspaceEdit {
  const editorConfig = vscode.workspace.getConfiguration("editor", document.uri);
  const formattingOptions = {
    tabSize: editorConfig.get<number>("tabSize", 2),
    insertSpaces: editorConfig.get<boolean>("insertSpaces", true),
    eol: document.eol === vscode.EndOfLine.CRLF ? "\r\n" : "\n",
  };

  let text = originalText;
  for (const { key, value } of missing) {
    const edits = modify(text, [...objectPath, key], value, { formattingOptions });
    text = applyEdits(text, edits);
  }

  const workspaceEdit = new vscode.WorkspaceEdit();
  const fullRange = new vscode.Range(document.positionAt(0), document.positionAt(originalText.length));
  workspaceEdit.replace(document.uri, fullRange, text);
  return workspaceEdit;
}
