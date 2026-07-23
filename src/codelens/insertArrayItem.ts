import * as vscode from "vscode";
import { applyEdits, modify } from "jsonc-parser";
import type { JsonPath } from "../schema/schemaAtPath";

/** Appends `item` to the array at `arrayPath` (index `arrayLength`) and applies the edit. */
export async function insertArrayItem(document: vscode.TextDocument, arrayPath: JsonPath, arrayLength: number, item: unknown): Promise<void> {
  const originalText = document.getText();
  const editorConfig = vscode.workspace.getConfiguration("editor", document.uri);
  const formattingOptions = {
    tabSize: editorConfig.get<number>("tabSize", 2),
    insertSpaces: editorConfig.get<boolean>("insertSpaces", true),
    eol: document.eol === vscode.EndOfLine.CRLF ? "\r\n" : "\n",
  };

  const edits = modify(originalText, [...arrayPath, arrayLength], item, { isArrayInsertion: true, formattingOptions });
  const newText = applyEdits(originalText, edits);

  const workspaceEdit = new vscode.WorkspaceEdit();
  const fullRange = new vscode.Range(document.positionAt(0), document.positionAt(originalText.length));
  workspaceEdit.replace(document.uri, fullRange, newText);
  await vscode.workspace.applyEdit(workspaceEdit);
}
