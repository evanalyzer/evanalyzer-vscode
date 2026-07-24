import * as vscode from "vscode";
import { AddItemCodeLensProvider } from "./codelens/addItemCodeLensProvider";
import { addClass, addPipeline, addPipelineCommand } from "./codelens/addItemCommands";
import { ClassColorProvider } from "./colors/classColorProvider";
import { createEvaFile } from "./commands/createFile";
import { PIPELINE_TEMPLATE, PROJECT, PROJECT_TEMPLATE } from "./fileTypes";
import { FillDefaultsCodeActionProvider } from "./quickfix/fillDefaultsCodeActionProvider";
import type { JsonPath } from "./schema/schemaAtPath";

const EVA_DOCUMENT_SELECTOR: vscode.DocumentSelector = [
  { language: "json", pattern: "**/*.evapipe" },
  { language: "json", pattern: "**/*.evaproj" },
  { language: "json", pattern: "**/*.evapt" },
];

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
    ),
    vscode.commands.registerCommand("evanalyzer.addClass", (uri: vscode.Uri, arrayPath: JsonPath) => addClass(uri, arrayPath)),
    vscode.commands.registerCommand("evanalyzer.addPipeline", (uri: vscode.Uri, arrayPath: JsonPath) => addPipeline(uri, arrayPath)),
    vscode.commands.registerCommand("evanalyzer.addPipelineCommand", (uri: vscode.Uri, arrayPath: JsonPath, insertIndex?: number) =>
      addPipelineCommand(context.extensionPath, uri, arrayPath, insertIndex)
    ),
    vscode.languages.registerCodeActionsProvider(
      EVA_DOCUMENT_SELECTOR,
      new FillDefaultsCodeActionProvider(context.extensionPath),
      FillDefaultsCodeActionProvider.metadata
    ),
    vscode.languages.registerColorProvider(EVA_DOCUMENT_SELECTOR, new ClassColorProvider()),
    vscode.languages.registerCodeLensProvider(EVA_DOCUMENT_SELECTOR, new AddItemCodeLensProvider())
  );
}

export function deactivate(): void {
  // Nothing to clean up: commands are disposed via context.subscriptions.
}
