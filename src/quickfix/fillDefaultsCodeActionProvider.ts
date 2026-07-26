import * as vscode from "vscode";
import { applyEdits, findNodeAtLocation, findNodeAtOffset, getNodePath, getNodeValue, modify, parseTree, type Node as JsoncNode } from "jsonc-parser";
import { fileTypeForFileName } from "../fileTypes";
import { nextClassId, nextPipelineId } from "../schema/nextId";
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
 * One exception: `id` fields (`Class.id`, `.evaproj`'s `PipelineSettings.id`)
 * are required with no static default, but a "next unused id" is something
 * we *can* compute from sibling array entries, so those get suggested too.
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

    const defaultable: FillEntry[] = Object.entries(schema.properties)
      .map(([key, propSchema]) => [key, resolveSchema(propSchema, rootSchema.$defs)] as const)
      .filter(([key, resolved]) => !existingKeys.has(key) && resolved.default !== undefined)
      .map(([key, resolved]) => ({ key, value: resolved.default }));

    const idSuggestion = computeIdSuggestion(objectPath, schema, existingKeys, tree, rootSchema.$defs);
    const missing = idSuggestion ? [...defaultable, idSuggestion] : defaultable;

    if (missing.length === 0) {
      return [];
    }

    const tag = schema.properties.type?.const;
    const title = typeof tag === "string" ? `Fill in default values for "${tag}"` : "Fill in default values";

    const action = new vscode.CodeAction(title, vscode.CodeActionKind.QuickFix);
    action.edit = buildFillEdit(document, text, objectPath, missing);
    action.isPreferred = true;
    return [action];
  }
}

function computeIdSuggestion(
  objectPath: JsonPath,
  schema: JsonSchema,
  existingKeys: Set<string>,
  tree: JsoncNode,
  defs: Record<string, JsonSchema>
): FillEntry | undefined {
  if (existingKeys.has("id")) {
    return undefined;
  }
  const idSchema = schema.properties?.id;
  if (!idSchema) {
    return undefined;
  }
  const resolvedId = resolveSchema(idSchema, defs);
  const arrayKey = objectPath[objectPath.length - 2];

  if (arrayKey === "classes" && resolvedId.oneOf) {
    const siblings = valueAtPath(tree, objectPath.slice(0, -1));
    return { key: "id", value: { VALID: nextClassId(siblings) } };
  }
  if (objectPath.length === 2 && objectPath[0] === "pipelines" && resolvedId.type === "integer") {
    const siblings = valueAtPath(tree, objectPath.slice(0, -1));
    return { key: "id", value: nextPipelineId(siblings) };
  }
  return undefined;
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
