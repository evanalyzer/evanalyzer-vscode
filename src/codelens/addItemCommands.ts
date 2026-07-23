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
 * These three handlers back the CodeLens "+ Add X" buttons. Each inserts
 * whatever can be computed or is always unambiguously valid (an id, a
 * generated color, "now" as a timestamp, an empty array/map) and
 * deliberately leaves genuine free-text content (a class's name, a
 * pipeline's description, ...) absent - VS Code's own JSON validation
 * already flags those with a clear "Missing property" diagnostic, which is
 * a better signal than a placeholder string the user has to remember to
 * replace.
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

  // .evapt: PipelineTemplate has no id, but does need a MetaData block.
  // Author fields are inherited from the project template's own top-level
  // meta (same author, most likely) - name/shortDescription/description
  // are genuine content only the user can supply.
  const projectMeta = (getNodeValue(findNodeAtLocation(tree, ["meta"]) ?? tree) as Record<string, unknown> | undefined) ?? {};
  const meta: Record<string, unknown> = { creationTime: new Date().toISOString() };
  for (const field of ["authorFirstName", "authorLastName", "authorOrganization"]) {
    if (typeof projectMeta[field] === "string" && projectMeta[field] !== "") {
      meta[field] = projectMeta[field];
    }
  }

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
