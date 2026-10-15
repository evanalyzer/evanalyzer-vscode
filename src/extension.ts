import * as vscode from "vscode";
import { AddItemCodeLensProvider } from "./codelens/addItemCodeLensProvider";
import {
  addClass,
  addComponentDefinition,
  addComponentParameter,
  addComponentStep,
  addPipeline,
  addPipelineCommand,
} from "./codelens/addItemCommands";
import { ClassColorProvider } from "./colors/classColorProvider";
import { createEvaFile } from "./commands/createFile";
import { AI_LEARNING_SETTINGS, COMPONENT_TEMPLATE, PROJECT, PROJECT_TEMPLATE } from "./fileTypes";
import { FillDefaultsCodeActionProvider } from "./quickfix/fillDefaultsCodeActionProvider";
import { ComponentCompletionProvider, registerReferenceDiagnostics } from "./references/referenceProviders";
import type { JsonPath } from "./schema/schemaAtPath";

const EVA_DOCUMENT_SELECTOR: vscode.DocumentSelector = [
  { language: "json", pattern: "**/*.evaproj" },
  { language: "json", pattern: "**/*.evapt" },
  { language: "json", pattern: "**/*.evacomp" },
  { language: "json", pattern: "**/*.ailearning.json" },
];

export function activate(context: vscode.ExtensionContext): void {
  context.subscriptions.push(
    vscode.commands.registerCommand("evanalyzer.newProject", (uri?: vscode.Uri) => createEvaFile(context, PROJECT, uri)),
    vscode.commands.registerCommand("evanalyzer.newProjectTemplate", (uri?: vscode.Uri) => createEvaFile(context, PROJECT_TEMPLATE, uri)),
    vscode.commands.registerCommand("evanalyzer.newComponent", (uri?: vscode.Uri) => createEvaFile(context, COMPONENT_TEMPLATE, uri)),
    vscode.commands.registerCommand("evanalyzer.newAiLearningSettings", (uri?: vscode.Uri) =>
      createEvaFile(context, AI_LEARNING_SETTINGS, uri)
    ),
    vscode.commands.registerCommand("evanalyzer.addClass", (uri: vscode.Uri, arrayPath: JsonPath) => addClass(uri, arrayPath)),
    vscode.commands.registerCommand("evanalyzer.addPipeline", (uri: vscode.Uri, arrayPath: JsonPath) => addPipeline(uri, arrayPath)),
    vscode.commands.registerCommand("evanalyzer.addPipelineCommand", (uri: vscode.Uri, arrayPath: JsonPath, insertIndex?: number) =>
      addPipelineCommand(context.extensionPath, uri, arrayPath, insertIndex)
    ),
    vscode.commands.registerCommand("evanalyzer.addComponentStep", (uri: vscode.Uri, arrayPath: JsonPath, insertIndex?: number) =>
      addComponentStep(uri, arrayPath, insertIndex)
    ),
    vscode.commands.registerCommand("evanalyzer.addComponentDefinition", (uri: vscode.Uri, arrayPath: JsonPath) =>
      addComponentDefinition(uri, arrayPath)
    ),
    vscode.commands.registerCommand("evanalyzer.addComponentParameter", (uri: vscode.Uri, arrayPath: JsonPath) =>
      addComponentParameter(uri, arrayPath)
    ),
    vscode.languages.registerCodeActionsProvider(
      EVA_DOCUMENT_SELECTOR,
      new FillDefaultsCodeActionProvider(context.extensionPath),
      FillDefaultsCodeActionProvider.metadata
    ),
    vscode.languages.registerColorProvider(EVA_DOCUMENT_SELECTOR, new ClassColorProvider()),
    vscode.languages.registerCodeLensProvider(EVA_DOCUMENT_SELECTOR, new AddItemCodeLensProvider()),
    vscode.languages.registerCompletionItemProvider(EVA_DOCUMENT_SELECTOR, new ComponentCompletionProvider(), '"')
  );
  registerReferenceDiagnostics(context);
}

export function deactivate(): void {
  // Nothing to clean up: everything is disposed via context.subscriptions.
}
