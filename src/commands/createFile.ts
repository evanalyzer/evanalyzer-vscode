import * as vscode from "vscode";
import { loadSchema } from "../schema/schemaLoader";
import { WizardCancelled, runWizard } from "../wizard/wizard";
import type { EvaFileType } from "../fileTypes";

export async function createEvaFile(context: vscode.ExtensionContext, fileType: EvaFileType, uriArg?: vscode.Uri): Promise<void> {
  try {
    const folder = await determineTargetFolder(uriArg);
    if (!folder) {
      return;
    }

    const target = await promptForTarget(folder, fileType);
    if (!target) {
      return;
    }

    const schema = await loadSchema(context.extensionPath, fileType.schemaFile);
    const data = await runWizard(schema, schema.$defs, fileType.title);

    const content = JSON.stringify(data, null, 2) + "\n";
    await vscode.workspace.fs.writeFile(target, Buffer.from(content, "utf8"));

    const document = await vscode.workspace.openTextDocument(target);
    await vscode.window.showTextDocument(document);
    void vscode.window.showInformationMessage(`Created ${vscode.workspace.asRelativePath(target)}.`);
  } catch (err) {
    if (err instanceof WizardCancelled) {
      return;
    }
    const message = err instanceof Error ? err.message : String(err);
    void vscode.window.showErrorMessage(`Failed to create ${fileType.title}: ${message}`);
  }
}

async function determineTargetFolder(uriArg?: vscode.Uri): Promise<vscode.Uri | undefined> {
  if (uriArg) {
    const stat = await vscode.workspace.fs.stat(uriArg);
    return stat.type === vscode.FileType.Directory ? uriArg : vscode.Uri.joinPath(uriArg, "..");
  }

  const folders = vscode.workspace.workspaceFolders;
  if (!folders || folders.length === 0) {
    const picked = await vscode.window.showOpenDialog({
      canSelectFiles: false,
      canSelectFolders: true,
      canSelectMany: false,
      openLabel: "Select destination folder",
    });
    return picked?.[0];
  }

  if (folders.length === 1) {
    return folders[0].uri;
  }

  const picked = await vscode.window.showWorkspaceFolderPick({ placeHolder: "Select a destination workspace folder" });
  return picked?.uri;
}

async function promptForTarget(folder: vscode.Uri, fileType: EvaFileType): Promise<vscode.Uri | undefined> {
  const name = await vscode.window.showInputBox({
    prompt: `File name for the new ${fileType.title}`,
    value: fileType.suggestedName,
    ignoreFocusOut: true,
    validateInput: (v) => (v.trim().length === 0 ? "A file name is required." : undefined),
  });
  if (!name) {
    return undefined;
  }

  const fileName = name.endsWith(fileType.extension) ? name : `${name}${fileType.extension}`;
  const target = vscode.Uri.joinPath(folder, fileName);

  const exists = await fileExists(target);
  if (exists) {
    const overwrite = await vscode.window.showWarningMessage(
      `${fileName} already exists. Overwrite it?`,
      { modal: true },
      "Overwrite"
    );
    if (overwrite !== "Overwrite") {
      return undefined;
    }
  }

  return target;
}

async function fileExists(uri: vscode.Uri): Promise<boolean> {
  try {
    await vscode.workspace.fs.stat(uri);
    return true;
  } catch {
    return false;
  }
}
