import * as vscode from "vscode";
import { parseTree } from "jsonc-parser";
import { AI_LEARNING_SETTINGS, MODULE_TEMPLATE, fileTypeForFileName } from "../fileTypes";
import { moduleCompletions } from "./moduleCompletions";
import { checkReferences } from "./referenceChecks";

const DIAGNOSTIC_DELAY_MS = 300;

/**
 * Publishes `checkReferences` results as diagnostics for open EVAnalyzer
 * documents, re-checking (debounced) as they change. Not for AI learning
 * settings files, which have no modules or class references to check.
 */
export function registerReferenceDiagnostics(context: vscode.ExtensionContext): void {
  const collection = vscode.languages.createDiagnosticCollection("evanalyzer");
  const timers = new Map<string, ReturnType<typeof setTimeout>>();

  const refresh = (document: vscode.TextDocument) => {
    const fileType = fileTypeForFileName(document.fileName);
    if (!fileType || fileType === AI_LEARNING_SETTINGS) {
      return;
    }
    const tree = parseTree(document.getText());
    if (!tree) {
      collection.delete(document.uri);
      return;
    }
    const diagnostics = checkReferences(tree, fileType === MODULE_TEMPLATE).map((issue) => {
      const range = new vscode.Range(document.positionAt(issue.offset), document.positionAt(issue.offset + issue.length));
      const severity = issue.severity === "error" ? vscode.DiagnosticSeverity.Error : vscode.DiagnosticSeverity.Warning;
      const diagnostic = new vscode.Diagnostic(range, issue.message, severity);
      diagnostic.source = "evanalyzer";
      return diagnostic;
    });
    collection.set(document.uri, diagnostics);
  };

  const schedule = (document: vscode.TextDocument) => {
    const key = document.uri.toString();
    clearTimeout(timers.get(key));
    timers.set(
      key,
      setTimeout(() => {
        timers.delete(key);
        refresh(document);
      }, DIAGNOSTIC_DELAY_MS)
    );
  };

  context.subscriptions.push(
    collection,
    vscode.workspace.onDidOpenTextDocument(refresh),
    vscode.workspace.onDidChangeTextDocument((event) => schedule(event.document)),
    vscode.workspace.onDidCloseTextDocument((document) => {
      clearTimeout(timers.get(document.uri.toString()));
      collection.delete(document.uri);
    }),
    { dispose: () => timers.forEach((timer) => clearTimeout(timer)) }
  );
  vscode.workspace.textDocuments.forEach(refresh);
}

export class ModuleCompletionProvider implements vscode.CompletionItemProvider {
  provideCompletionItems(document: vscode.TextDocument, position: vscode.Position): vscode.CompletionItem[] {
    const fileType = fileTypeForFileName(document.fileName);
    if (!fileType) {
      return [];
    }
    return moduleCompletions(document.getText(), document.offsetAt(position), fileType === MODULE_TEMPLATE).map((suggestion) => {
      const item = new vscode.CompletionItem(suggestion.label, vscode.CompletionItemKind.Reference);
      item.insertText = suggestion.insertText;
      item.detail = suggestion.detail;
      item.documentation = suggestion.documentation;
      // Sort ahead of the generic JSON completions for the same spot.
      item.sortText = `0_${suggestion.label}`;
      if (suggestion.replace) {
        item.range = new vscode.Range(
          document.positionAt(suggestion.replace.offset),
          document.positionAt(suggestion.replace.offset + suggestion.replace.length)
        );
        // Filter on the full quoted text being replaced, not just the label.
        item.filterText = suggestion.insertText;
      }
      return item;
    });
  }
}
