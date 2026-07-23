import * as vscode from "vscode";
import { getNodePath, parseTree, type Node as JsoncNode } from "jsonc-parser";
import { fileTypeForFileName } from "../fileTypes";

/**
 * "+ Add X" buttons above the classes/pipelines/pipeline-steps arrays.
 * Located purely by property key name (verified unique per file: "classes"
 * only under ClassificationSettings, "pipelines" only at the document root,
 * "pipelineSteps"/"steps" only under a single pipeline entry - or, for
 * .evapipe files, "pipelineSteps" at the document root since the whole file
 * *is* a PipelineTemplate) rather than a full schema walk, since these
 * array locations are fixed and well-known.
 */
export class AddItemCodeLensProvider implements vscode.CodeLensProvider {
  provideCodeLenses(document: vscode.TextDocument): vscode.CodeLens[] {
    const fileType = fileTypeForFileName(document.fileName);
    if (!fileType) {
      return [];
    }

    const tree = parseTree(document.getText());
    if (!tree) {
      return [];
    }

    const lenses: vscode.CodeLens[] = [];
    walk(tree, (node) => {
      if (node.type !== "property" || !node.children || node.children.length < 2) {
        return;
      }
      const [keyNode, valueNode] = node.children;
      if (valueNode.type !== "array" || typeof keyNode.value !== "string") {
        return;
      }

      const key = keyNode.value;
      const arrayPath = getNodePath(valueNode);
      const position = document.positionAt(keyNode.offset);
      const range = new vscode.Range(position, position);

      if (key === "classes") {
        lenses.push(
          new vscode.CodeLens(range, { title: "$(add) Add Class", command: "evanalyzer.addClass", arguments: [document.uri, arrayPath] })
        );
      } else if (key === "pipelines" && arrayPath.length === 1) {
        lenses.push(
          new vscode.CodeLens(range, { title: "$(add) Add Pipeline", command: "evanalyzer.addPipeline", arguments: [document.uri, arrayPath] })
        );
      } else if (key === "pipelineSteps" || key === "steps") {
        lenses.push(
          new vscode.CodeLens(range, {
            title: "$(add) Add Pipeline Command",
            command: "evanalyzer.addPipelineCommand",
            arguments: [document.uri, arrayPath],
          })
        );
      }
    });

    return lenses;
  }
}

function walk(node: JsoncNode, visit: (node: JsoncNode) => void): void {
  visit(node);
  for (const child of node.children ?? []) {
    walk(child, visit);
  }
}
