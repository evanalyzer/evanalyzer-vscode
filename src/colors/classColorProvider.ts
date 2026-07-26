import * as vscode from "vscode";
import { parseTree, type Node as JsoncNode } from "jsonc-parser";

const HEX_COLOR = /^#[0-9a-fA-F]{6}$/;

/**
 * Native color swatch + picker for `Class.color`. Confirmed against the
 * Rust source (crates/cfg/src/utils/hex_colors.rs): `color` is a `u32`
 * serialized as `#rrggbb` (serializer emits lowercase, deserializer accepts
 * either case, no alpha channel). "color" as a property key is unique to
 * `Class` across all three schemas, so matching on key name + hex shape is
 * unambiguous here without needing full schema resolution.
 */
export class ClassColorProvider implements vscode.DocumentColorProvider {
  provideDocumentColors(document: vscode.TextDocument): vscode.ColorInformation[] {
    const tree = parseTree(document.getText());
    if (!tree) {
      return [];
    }

    const results: vscode.ColorInformation[] = [];
    walk(tree, (node) => {
      if (node.type !== "property" || !node.children || node.children.length < 2) {
        return;
      }
      const [keyNode, valueNode] = node.children;
      if (keyNode.value !== "color" || valueNode.type !== "string" || typeof valueNode.value !== "string") {
        return;
      }
      const match = HEX_COLOR.exec(valueNode.value);
      if (!match) {
        return;
      }

      const range = new vscode.Range(document.positionAt(valueNode.offset), document.positionAt(valueNode.offset + valueNode.length));
      results.push(new vscode.ColorInformation(range, hexToColor(valueNode.value)));
    });
    return results;
  }

  provideColorPresentations(color: vscode.Color): vscode.ColorPresentation[] {
    const hex = colorToHex(color);
    const presentation = new vscode.ColorPresentation(`"${hex}"`);
    return [presentation];
  }
}

function walk(node: JsoncNode, visit: (node: JsoncNode) => void): void {
  visit(node);
  for (const child of node.children ?? []) {
    walk(child, visit);
  }
}

function hexToColor(hex: string): vscode.Color {
  const value = parseInt(hex.slice(1), 16);
  const r = ((value >> 16) & 0xff) / 255;
  const g = ((value >> 8) & 0xff) / 255;
  const b = (value & 0xff) / 255;
  return new vscode.Color(r, g, b, 1);
}

function colorToHex(color: vscode.Color): string {
  const channel = (v: number) =>
    Math.round(Math.min(1, Math.max(0, v)) * 255)
      .toString(16)
      .padStart(2, "0");
  return `#${channel(color.red)}${channel(color.green)}${channel(color.blue)}`;
}
