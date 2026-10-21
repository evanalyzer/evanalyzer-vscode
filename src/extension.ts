import * as vscode from "vscode";
import { AddItemCodeLensProvider } from "./codelens/addItemCodeLensProvider";
import {
  addClass,
  addModuleDefinition,
  addModuleParameter,
  addModuleStep,
  addPipeline,
  addPipelineCommand,
} from "./codelens/addItemCommands";
import { ClassColorProvider } from "./colors/classColorProvider";
import { createEvaFile } from "./commands/createFile";
import { AI_LEARNING_SETTINGS, MODULE_TEMPLATE, PROJECT, PROJECT_TEMPLATE } from "./fileTypes";
import { FillDefaultsCodeActionProvider } from "./quickfix/fillDefaultsCodeActionProvider";
import { ModuleCompletionProvider, registerReferenceDiagnostics } from "./references/referenceProviders";
import type { JsonPath } from "./schema/schemaAtPath";

const EVA_DOCUMENT_SELECTOR: vscode.DocumentSelector = [
  { language: "json", pattern: "**/*.evaproj" },
  { language: "json", pattern: "**/*.evatemplate" },
  { language: "json", pattern: "**/*.evamodule" },
  { language: "json", pattern: "**/*.ailearning.json" },
];

export function activate(context: vscode.ExtensionContext): void {
  context.subscriptions.push(
    vscode.commands.registerCommand("evanalyzer.newProject", (uri?: vscode.Uri) => createEvaFile(context, PROJECT, uri)),
    vscode.commands.registerCommand("evanalyzer.newProjectTemplate", (uri?: vscode.Uri) => createEvaFile(context, PROJECT_TEMPLATE, uri)),
    vscode.commands.registerCommand("evanalyzer.newModule", (uri?: vscode.Uri) => createEvaFile(context, MODULE_TEMPLATE, uri)),
    vscode.commands.registerCommand("evanalyzer.newAiLearningSettings", (uri?: vscode.Uri) =>
      createEvaFile(context, AI_LEARNING_SETTINGS, uri)
    ),
    vscode.commands.registerCommand("evanalyzer.addClass", (uri: vscode.Uri, arrayPath: JsonPath) => addClass(uri, arrayPath)),
    vscode.commands.registerCommand("evanalyzer.addPipeline", (uri: vscode.Uri, arrayPath: JsonPath) => addPipeline(uri, arrayPath)),
    vscode.commands.registerCommand("evanalyzer.addPipelineCommand", (uri: vscode.Uri, arrayPath: JsonPath, insertIndex?: number) =>
      addPipelineCommand(context.extensionPath, uri, arrayPath, insertIndex)
    ),
    vscode.commands.registerCommand("evanalyzer.addModuleStep", (uri: vscode.Uri, arrayPath: JsonPath, insertIndex?: number) =>
      addModuleStep(uri, arrayPath, insertIndex)
    ),
    vscode.commands.registerCommand("evanalyzer.addModuleDefinition", (uri: vscode.Uri, arrayPath: JsonPath) =>
      addModuleDefinition(uri, arrayPath)
    ),
    vscode.commands.registerCommand("evanalyzer.addModuleParameter", (uri: vscode.Uri, arrayPath: JsonPath) =>
      addModuleParameter(uri, arrayPath)
    ),
    vscode.languages.registerCodeActionsProvider(
      EVA_DOCUMENT_SELECTOR,
      new FillDefaultsCodeActionProvider(context.extensionPath),
      FillDefaultsCodeActionProvider.metadata
    ),
    vscode.languages.registerColorProvider(EVA_DOCUMENT_SELECTOR, new ClassColorProvider()),
    vscode.languages.registerCodeLensProvider(EVA_DOCUMENT_SELECTOR, new AddItemCodeLensProvider()),
    vscode.languages.registerCompletionItemProvider(EVA_DOCUMENT_SELECTOR, new ModuleCompletionProvider(), '"')
  );
  registerReferenceDiagnostics(context);
}

export function deactivate(): void {
  // Nothing to clean up: everything is disposed via context.subscriptions.
}
