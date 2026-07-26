import { Position, Uri, EndOfLine } from "./vscode-mock";

/**
 * Builds a plain object shaped like `vscode.TextDocument`, with real
 * offset<->position math (tests check exact line numbers for CodeLens
 * placement). Not a `vscode` export - real VS Code has no public
 * TextDocument constructor; documents only ever come from the editor.
 */
export function createTestDocument(text: string, fileName: string) {
  const lineStarts = computeLineStarts(text);

  return {
    fileName,
    uri: Uri.file(fileName),
    languageId: "json",
    version: 1,
    eol: EndOfLine.LF,
    getText: () => text,
    positionAt: (offset: number) => offsetToPosition(offset, lineStarts),
    offsetAt: (position: Position) => positionToOffset(position, lineStarts, text.length),
  };
}

function computeLineStarts(text: string): number[] {
  const starts = [0];
  for (let i = 0; i < text.length; i++) {
    if (text[i] === "\n") {
      starts.push(i + 1);
    }
  }
  return starts;
}

function offsetToPosition(offset: number, lineStarts: number[]): Position {
  let line = 0;
  for (let i = 0; i < lineStarts.length; i++) {
    if (lineStarts[i] <= offset) {
      line = i;
    } else {
      break;
    }
  }
  return new Position(line, offset - lineStarts[line]);
}

function positionToOffset(position: Position, lineStarts: number[], textLength: number): number {
  const start = lineStarts[position.line] ?? textLength;
  return start + position.character;
}
