import * as vscode from "vscode";
import { getNodePath, parseTree, type Node as JsoncNode } from "jsonc-parser";
import { COMPONENT_TEMPLATE, fileTypeForFileName } from "../fileTypes";
import {
  isClassArray,
  isComponentDefinitionsArray,
  isParametersArray,
  isPipelinesArray,
  isStepsArray,
} from "../schema/locations";
import type { JsonPath } from "../schema/schemaAtPath";

/**
 * "+ Add X" buttons above the classes / pipelines / steps / component
 * definitions / component parameters arrays. Located by JSON path (see
 * schema/locations.ts) rather than a full schema walk, since these array
 * locations are fixed and well-known.
 */
export class AddItemCodeLensProvider implements vscode.CodeLensProvider {
  provideCodeLenses(document: vscode.TextDocument): vscode.CodeLens[] {
    const fileType = fileTypeForFileName(document.fileName);
    if (!fileType) {
      return [];
    }
    const isComponentFile = fileType === COMPONENT_TEMPLATE;

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

      const arrayPath = getNodePath(valueNode);
      const position = document.positionAt(keyNode.offset);
      const range = new vscode.Range(position, position);
      const lens = (title: string, command: string, args: unknown[] = [document.uri, arrayPath]) =>
        lenses.push(new vscode.CodeLens(range, { title, command, arguments: args }));

      if (isClassArray(arrayPath, isComponentFile)) {
        lens("$(add) Add Class", "evanalyzer.addClass");
      } else if (isPipelinesArray(arrayPath, isComponentFile)) {
        lens("$(add) Add Pipeline", "evanalyzer.addPipeline");
      } else if (isComponentDefinitionsArray(arrayPath, isComponentFile)) {
        lens("$(add) Add Component Definition", "evanalyzer.addComponentDefinition");
      } else if (isParametersArray(arrayPath, isComponentFile)) {
        lens("$(add) Add Parameter", "evanalyzer.addComponentParameter");
      } else if (isStepsArray(arrayPath, isComponentFile)) {
        pushStepLenses(document, valueNode, arrayPath, lenses);
      }
    });

    return lenses;
  }
}

/**
 * One pair of buttons above each existing step (insert before that step)
 * plus one pair anchored at the array's closing bracket (append at the
 * end), so a step can be added at any position, not just appended. The
 * trailing pair is deliberately anchored at the bracket rather than above
 * the array (i.e. before the first item) - that position would otherwise
 * read as just another "insert before item 0".
 */
function pushStepLenses(document: vscode.TextDocument, arrayNode: JsoncNode, arrayPath: JsonPath, lenses: vscode.CodeLens[]): void {
  const pushPair = (range: vscode.Range, extraArgs: unknown[]) => {
    lenses.push(
      new vscode.CodeLens(range, {
        title: "$(add) Add Pipeline Command",
        command: "evanalyzer.addPipelineCommand",
        arguments: [document.uri, arrayPath, ...extraArgs],
      }),
      new vscode.CodeLens(range, {
        title: "$(symbol-module) Use Component",
        command: "evanalyzer.addComponentStep",
        arguments: [document.uri, arrayPath, ...extraArgs],
      })
    );
  };

  for (const [index, itemNode] of (arrayNode.children ?? []).entries()) {
    const itemPosition = document.positionAt(itemNode.offset);
    pushPair(new vscode.Range(itemPosition, itemPosition), [index]);
  }
  const endPosition = document.positionAt(arrayNode.offset + arrayNode.length - 1);
  pushPair(new vscode.Range(endPosition, endPosition), []);
}

function walk(node: JsoncNode, visit: (node: JsoncNode) => void): void {
  visit(node);
  for (const child of node.children ?? []) {
    walk(child, visit);
  }
}
