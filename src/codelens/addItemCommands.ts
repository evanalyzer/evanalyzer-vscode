import * as vscode from "vscode";
import { parseTree, type Node as JsoncNode } from "jsonc-parser";
import { nextDistinctColorHex } from "../colors/nextDistinctColor";
import { COMPONENT_TEMPLATE, fileTypeForFileName } from "../fileTypes";
import { componentDefinitions, valueAt } from "../references/componentIndex";
import { owningComponentPath } from "../schema/locations";
import { nextClassId, nextPipelineId, nextStepId } from "../schema/nextId";
import type { JsonPath } from "../schema/schemaAtPath";
import { loadSchema } from "../schema/schemaLoader";
import { WizardCancelled, runWizard } from "../wizard/wizard";
import { insertArrayItem } from "./insertArrayItem";

/**
 * These handlers back the CodeLens "+ Add X" buttons. Each produces a
 * complete, schema-valid skeleton immediately: computed/generated values
 * where there's something sensible to compute (an id, a generated color,
 * "now" as a timestamp, an empty array/map), and an empty string for
 * genuine free-text content (a class's name, a pipeline's name, ...)
 * that only the user can actually write - present as an editable field
 * rather than left out for a "Missing property" diagnostic to catch later.
 */

export async function addClass(uri: vscode.Uri, arrayPath: JsonPath): Promise<void> {
  const target = await openArray(uri, arrayPath);
  if (!target) {
    return;
  }
  await insertArrayItem(target.document, arrayPath, target.existing.length, {
    id: nextClassId(target.existing),
    color: nextDistinctColorHex(target.existing.length),
    name: "",
    notes: "",
  });
}

export async function addPipeline(uri: vscode.Uri, arrayPath: JsonPath): Promise<void> {
  const target = await openArray(uri, arrayPath);
  if (!target) {
    return;
  }
  await insertArrayItem(target.document, arrayPath, target.existing.length, {
    id: nextPipelineId(target.existing),
    name: "",
    imageSource: "SCRATCHPAD",
    enabled: true,
    steps: [],
  });
}

export async function addComponentDefinition(uri: vscode.Uri, arrayPath: JsonPath): Promise<void> {
  const target = await openArray(uri, arrayPath);
  if (!target) {
    return;
  }
  await insertArrayItem(target.document, arrayPath, target.existing.length, {
    key: "",
    meta: newMetaData(target.tree),
    classes: [],
    steps: [],
    parameters: [],
  });
}

export async function addComponentParameter(uri: vscode.Uri, arrayPath: JsonPath): Promise<void> {
  const target = await openArray(uri, arrayPath);
  if (!target) {
    return;
  }
  await insertArrayItem(target.document, arrayPath, target.existing.length, {
    key: "",
    label: "",
    description: "",
    default: "",
    bindings: [],
  });
}

export async function addPipelineCommand(
  extensionPath: string,
  uri: vscode.Uri,
  arrayPath: JsonPath,
  insertIndex?: number
): Promise<void> {
  const fileType = fileTypeForFileName(uri.fsPath);
  const target = await openArray(uri, arrayPath);
  if (!fileType || !target) {
    return;
  }

  const rootSchema = await loadSchema(extensionPath, fileType.schemaFile);
  const commandSchema = rootSchema.$defs.PipelineCommand;
  if (!commandSchema) {
    return;
  }

  let command: Record<string, unknown>;
  try {
    command = await runWizard(commandSchema, rootSchema.$defs, "Pipeline Command");
  } catch (err) {
    if (err instanceof WizardCancelled) {
      return;
    }
    throw err;
  }

  // Undefined means "append" (the CodeLens at the array's closing bracket);
  // a CodeLens above a specific existing item passes its index instead, to
  // insert before that item rather than at the end.
  const targetIndex = insertIndex ?? target.existing.length;
  await insertArrayItem(target.document, arrayPath, targetIndex, { id: nextStepId(target.existing), enabled: true, command });
}

interface ComponentPickItem extends vscode.QuickPickItem {
  key: string;
}

/**
 * Inserts a step that runs one of the file's component definitions
 * (`components` in projects/templates, `uses` in `.evacomp`). `values`
 * starts empty: a parameter missing there takes the definition's default.
 */
export async function addComponentStep(uri: vscode.Uri, arrayPath: JsonPath, insertIndex?: number): Promise<void> {
  const fileType = fileTypeForFileName(uri.fsPath);
  const target = await openArray(uri, arrayPath);
  if (!fileType || !target) {
    return;
  }
  const isComponentFile = fileType === COMPONENT_TEMPLATE;

  const items = availableComponents(target.tree, arrayPath, isComponentFile);
  if (items.length === 0) {
    const where = isComponentFile ? "uses" : "components";
    void vscode.window.showInformationMessage(`No component definitions to use yet - add one under "${where}" first.`);
    return;
  }

  const picked = await vscode.window.showQuickPick(items, { placeHolder: "Component to use", ignoreFocusOut: true });
  if (!picked) {
    return;
  }

  const targetIndex = insertIndex ?? target.existing.length;
  await insertArrayItem(target.document, arrayPath, targetIndex, {
    id: nextStepId(target.existing),
    enabled: true,
    component: { key: picked.key, values: {} },
  });
}

/** Component definitions a steps array can use - excluding the one that owns the array, which can't use itself. */
export function availableComponents(tree: JsoncNode, stepsPath: JsonPath, isComponentFile: boolean): ComponentPickItem[] {
  const ownerPath = owningComponentPath(stepsPath, isComponentFile);
  const ownKey = ownerPath ? valueAt(tree, [...ownerPath, "key"]) : undefined;
  return componentDefinitions(tree, isComponentFile)
    .filter((definition) => definition.key.length > 0 && definition.key !== ownKey)
    .map((definition) => ({
      label: definition.name ?? definition.key,
      description: definition.key,
      detail: definition.shortDescription,
      key: definition.key,
    }));
}

/**
 * A complete MetaData block for a new component definition. `authors` is
 * inherited from the file's own top-level meta when present (same author,
 * most likely); everything else - genuine content only the user can
 * write - starts as "".
 */
function newMetaData(tree: JsoncNode): Record<string, unknown> {
  const authors = valueAt(tree, ["meta", "authors"]);
  return {
    name: "",
    shortDescription: "",
    description: "",
    authors: Array.isArray(authors) ? authors : [],
    creationTime: new Date().toISOString(),
  };
}

async function openArray(
  uri: vscode.Uri,
  arrayPath: JsonPath
): Promise<{ document: vscode.TextDocument; tree: JsoncNode; existing: unknown[] } | undefined> {
  const document = await vscode.workspace.openTextDocument(uri);
  const tree = parseTree(document.getText());
  if (!tree) {
    return undefined;
  }
  const value = valueAt(tree, arrayPath);
  return { document, tree, existing: Array.isArray(value) ? value : [] };
}
