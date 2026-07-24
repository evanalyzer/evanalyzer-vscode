import * as vscode from "vscode";
import { findNodeAtLocation, getNodeValue, parseTree } from "jsonc-parser";
import { nextDistinctColorHex } from "../colors/nextDistinctColor";
import { fileTypeForFileName, PROJECT } from "../fileTypes";
import { nextClassId, nextPipelineId } from "../schema/nextId";
import type { JsonPath } from "../schema/schemaAtPath";
import { loadSchema } from "../schema/schemaLoader";
import { WizardCancelled, runWizard } from "../wizard/wizard";
import { insertArrayItem } from "./insertArrayItem";

/**
 * These three handlers back the CodeLens "+ Add X" buttons. Each produces a
 * complete, schema-valid skeleton immediately: computed/generated values
 * where there's something sensible to compute (an id, a generated color,
 * "now" as a timestamp, an empty array/map), and an empty string for
 * genuine free-text content (a class's name, a pipeline's description, ...)
 * that only the user can actually write - present as an editable field
 * rather than left out for a "Missing property" diagnostic to catch later.
 */

export async function addClass(uri: vscode.Uri, arrayPath: JsonPath): Promise<void> {
  const document = await vscode.workspace.openTextDocument(uri);
  const tree = parseTree(document.getText());
  if (!tree) {
    return;
  }
  const existing = (getNodeValue(findNodeAtLocation(tree, arrayPath) ?? tree) as unknown[]) ?? [];

  await insertArrayItem(document, arrayPath, existing.length, {
    id: { VALID: nextClassId(existing) },
    color: nextDistinctColorHex(existing.length),
    name: "",
    notes: "",
    measure: {},
  });
}

export async function addPipeline(uri: vscode.Uri, arrayPath: JsonPath): Promise<void> {
  const fileType = fileTypeForFileName(uri.fsPath);
  if (!fileType) {
    return;
  }
  const document = await vscode.workspace.openTextDocument(uri);
  const tree = parseTree(document.getText());
  if (!tree) {
    return;
  }
  const existing = (getNodeValue(findNodeAtLocation(tree, arrayPath) ?? tree) as unknown[]) ?? [];

  if (fileType === PROJECT) {
    await insertArrayItem(document, arrayPath, existing.length, {
      id: nextPipelineId(existing),
      imageSource: "SCRATCHPAD",
      enabled: true,
      steps: [],
    });
    return;
  }

  // .evapt: PipelineTemplate has no id, but does need a complete MetaData
  // block. Author fields are inherited from the project template's own
  // top-level meta when present (same author, most likely); everything
  // else - genuine content only the user can write - starts as "".
  const projectMeta = (getNodeValue(findNodeAtLocation(tree, ["meta"]) ?? tree) as Record<string, unknown> | undefined) ?? {};
  const inheritedAuthor = (field: string) => (typeof projectMeta[field] === "string" ? (projectMeta[field] as string) : "");
  const meta: Record<string, unknown> = {
    name: "",
    shortDescription: "",
    description: "",
    authorFirstName: inheritedAuthor("authorFirstName"),
    authorLastName: inheritedAuthor("authorLastName"),
    authorOrganization: inheritedAuthor("authorOrganization"),
    creationTime: new Date().toISOString(),
  };

  await insertArrayItem(document, arrayPath, existing.length, { meta, pipelineSteps: [] });
}

export async function addPipelineCommand(extensionPath: string, uri: vscode.Uri, arrayPath: JsonPath): Promise<void> {
  const fileType = fileTypeForFileName(uri.fsPath);
  if (!fileType) {
    return;
  }
  const document = await vscode.workspace.openTextDocument(uri);
  const tree = parseTree(document.getText());
  if (!tree) {
    return;
  }
  const existing = (getNodeValue(findNodeAtLocation(tree, arrayPath) ?? tree) as unknown[]) ?? [];

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

  await insertArrayItem(document, arrayPath, existing.length, { enabled: true, command });
}
