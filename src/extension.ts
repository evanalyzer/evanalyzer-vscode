import * as vscode from "vscode";
import { createEvaFile } from "./commands/createFile";
import { PIPELINE_TEMPLATE, PROJECT, PROJECT_TEMPLATE } from "./fileTypes";

export function activate(context: vscode.ExtensionContext): void {
  context.subscriptions.push(
    vscode.commands.registerCommand("evanalyzer.newProject", (uri?: vscode.Uri) =>
      createEvaFile(context, PROJECT, uri)
    ),
    vscode.commands.registerCommand("evanalyzer.newProjectTemplate", (uri?: vscode.Uri) =>
      createEvaFile(context, PROJECT_TEMPLATE, uri)
    ),
    vscode.commands.registerCommand("evanalyzer.newPipelineTemplate", (uri?: vscode.Uri) =>
      createEvaFile(context, PIPELINE_TEMPLATE, uri)
    )
  );
}

export function deactivate(): void {
  // Nothing to clean up: commands are disposed via context.subscriptions.
}
