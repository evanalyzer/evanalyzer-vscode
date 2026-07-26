import { vi } from "vitest";

/**
 * Minimal stand-in for the `vscode` module (a virtual module normally only
 * provided by the real extension host, so it doesn't resolve under a plain
 * test runner at all). Aliased over `vscode` in vitest.config.ts.
 *
 * Only implements what this extension's source actually uses (see the
 * `grep -roh 'vscode\.[A-Za-z]+' src` inventory this was built from), with
 * real behavior where the tests care about it (Position/Range line-offset
 * math, Uri.joinPath, WorkspaceEdit recording, CodeActionKind.contains) and
 * `vi.fn()` stubs elsewhere, so individual tests can configure return
 * values with the normal vitest mocking API.
 */

export class Position {
  constructor(
    public readonly line: number,
    public readonly character: number
  ) {}
}

export class Range {
  constructor(
    public readonly start: Position,
    public readonly end: Position
  ) {}
}

export class Selection extends Range {}

export class Uri {
  private constructor(
    public readonly fsPath: string,
    public readonly scheme: string = "file"
  ) {}

  static file(fsPath: string): Uri {
    return new Uri(fsPath);
  }

  static joinPath(base: Uri, ...segments: string[]): Uri {
    const parts = [base.fsPath.replace(/\/+$/, ""), ...segments];
    return new Uri(parts.join("/"));
  }

  toString(): string {
    return `${this.scheme}://${this.fsPath}`;
  }
}

export class ThemeIcon {
  constructor(public readonly id: string) {}
}

export const QuickPickItemKind = { Separator: -1, Default: 0 } as const;

export const EndOfLine = { LF: 1, CRLF: 2 } as const;

export const FileType = { Unknown: 0, File: 1, Directory: 2, SymbolicLink: 64 } as const;

export class CodeActionKind {
  static readonly QuickFix = new CodeActionKind("quickfix");
  static readonly Empty = new CodeActionKind("");

  constructor(public readonly value: string) {}

  append(part: string): CodeActionKind {
    return new CodeActionKind(this.value ? `${this.value}.${part}` : part);
  }

  contains(other: CodeActionKind): boolean {
    return other.value === this.value || other.value.startsWith(`${this.value}.`);
  }
}

export class CodeAction {
  public edit: unknown;
  public isPreferred?: boolean;
  constructor(
    public readonly title: string,
    public readonly kind?: CodeActionKind
  ) {}
}

export class CodeLens {
  constructor(
    public readonly range: Range,
    public readonly command?: { title: string; command: string; arguments?: unknown[] }
  ) {}
}

export class Color {
  constructor(
    public readonly red: number,
    public readonly green: number,
    public readonly blue: number,
    public readonly alpha: number
  ) {}
}

export class ColorInformation {
  constructor(
    public readonly range: Range,
    public readonly color: Color
  ) {}
}

export class ColorPresentation {
  constructor(public readonly label: string) {}
}

interface RecordedEdit {
  uri: Uri;
  range: Range;
  newText: string;
}

export class WorkspaceEdit {
  public readonly edits: RecordedEdit[] = [];

  replace(uri: Uri, range: Range, newText: string): void {
    this.edits.push({ uri, range, newText });
  }
}

export const window = {
  showQuickPick: vi.fn(),
  showInputBox: vi.fn(),
  createInputBox: vi.fn(),
  showErrorMessage: vi.fn(),
  showInformationMessage: vi.fn(),
  showWarningMessage: vi.fn(),
  showOpenDialog: vi.fn(),
  showTextDocument: vi.fn(),
  showWorkspaceFolderPick: vi.fn(),
};

export const workspace = {
  getConfiguration: vi.fn(() => ({
    get: (_key: string, defaultValue: unknown) => defaultValue,
  })),
  applyEdit: vi.fn(),
  openTextDocument: vi.fn(),
  asRelativePath: vi.fn((uri: Uri) => uri.fsPath),
  workspaceFolders: undefined as unknown,
  fs: {
    stat: vi.fn(),
    writeFile: vi.fn(),
  },
};

export const commands = {
  registerCommand: vi.fn(),
};

export const languages = {
  registerCodeActionsProvider: vi.fn(),
  registerCodeLensProvider: vi.fn(),
  registerColorProvider: vi.fn(),
};
