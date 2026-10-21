# EVAnalyzer File Support

VS Code extension for EVAnalyzer's JSON-based file formats.

| Extension          | Contents                                             | Schema                                 |
|--------------------|------------------------------------------------------|----------------------------------------|
| `.evaproj`         | Project files                                        | `schemas/project.schema.json`          |
| `.evatemplate`     | Project templates                                    | `schemas/project_template.schema.json` |
| `.evamodule`       | Modules (module library files)                       | `schemas/module_template.schema.json`  |
| `.ailearning.json` | AI learning settings (`train-classifier --settings`) | `schemas/ai_learning.schema.json`      |

`.evamodule` (formerly `.evacomp`, "components") replaced the old `.evapipe`
pipeline templates; `.evatemplate` was formerly `.evapt`. evanalyzer itself
reads AI learning settings from any `.json` path; the `.ailearning.json`
suffix is this extension's convention, so those files get validation without
the extension claiming every `.json` file.

<!-- evanalyzer-schema-version:start -->
Schemas last synced from evanalyzer branch [ai-plugin](https://github.com/evanalyzer/evanalyzer/tree/ai-plugin) (53d123b4, unreleased).
<!-- evanalyzer-schema-version:end -->

## What it does

- **Editing**: associates the extensions with VS Code's built-in `json`
  language (syntax highlighting, bracket matching, folding) and registers
  each one's JSON Schema via `jsonValidation`, giving you red squiggles on
  invalid documents, hover docs, and autocomplete.
- **Reference checks**: diagnostics for what a schema can't express - a
  module step naming a module that isn't defined (or its own
  module), `values` setting a parameter the module doesn't have, a
  parameter binding pointing at a step id the module doesn't have,
  duplicate class/pipeline/step ids and module/parameter keys, `LOCAL`
  classes outside a module or not among its local classes, and (in
  projects/templates) `GLOBAL` classes missing from `classification`.
- **Completions** for those references: module keys in a module
  step, a module's parameter names (with defaults) in its `values`, and
  the module's step ids in a parameter binding's `step`.
- **CodeLens buttons**: Add Class, Add Pipeline, Add Module Definition,
  Add Parameter, and - before each step and at the end of every step list -
  Add Pipeline Command (a wizard for the command) and Use Module (pick
  one of the file's module definitions). New ids follow evanalyzer's own
  rules (class and step ids start at 1, one above the highest).
- **Quick Fixes**: fill in an object's missing schema defaults (and a
  computed id), and fill a module step's `values` with every parameter
  of the module it uses, at its default.
- **Creating**: four commands walk the relevant JSON Schema and prompt you
  only for the fields it actually requires, then write a valid starter file:
  - `EVAnalyzer: New Project...`
  - `EVAnalyzer: New Project Template...`
  - `EVAnalyzer: New Module...`
  - `EVAnalyzer: New AI Learning Settings...`

  Run them from the Command Palette, or right-click a folder in the Explorer
  → **New EVAnalyzer File**. After the required fields are filled in, the
  wizard offers to add any optional fields too.

## Project layout

```
evanalyzer-vscode/
├── package.json            Extension manifest: commands, menus, jsonValidation
├── tsconfig.json            TypeScript compiler options (type-checking only)
├── esbuild.js               Bundles src/ → dist/extension.js
├── src/
│   ├── extension.ts          activate(): registers commands and providers
│   ├── fileTypes.ts          Maps each file type to its schema + extension
│   ├── codelens/             "+ Add X" buttons and the handlers behind them
│   ├── colors/               Color swatches/picker for Class.color
│   ├── commands/
│   │   └── createFile.ts     Picks a destination, runs the wizard, writes the file
│   ├── quickfix/             "Fill in default values" / module parameter values
│   ├── references/           Module index, reference diagnostics, completions
│   ├── schema/
│   │   ├── types.ts          Minimal JSON Schema (2020-12) typing
│   │   ├── schemaLoader.ts   Loads/caches the bundled schema JSON
│   │   ├── resolve.ts        Resolves $ref, incl. schemars' ref+sibling-keyword pattern
│   │   ├── schemaAtPath.ts   The schema in effect at a JSON path of a document
│   │   └── locations.ts      Where classes/pipelines/steps/modules live, by path
│   └── wizard/
│       └── wizard.ts         Recursively prompts for a schema-conformant value
├── schemas/                  Bundled copies of the generated JSON schemas
└── sync-schemas.sh           Re-copies schemas from ../evanalyzer/docs after a Rust rebuild
```

## Develop

```bash
npm install
npm run watch     # incremental esbuild in the background
```

Press F5 (or Run ▸ Start Debugging) to launch an Extension Development Host
with the extension active. Open a folder there and try **New EVAnalyzer
Project...** from the Command Palette, or a `.evaproj`/`.evatemplate`/`.evamodule`
file (`test/` has samples) to see validation/autocomplete.

`npm run check-types` type-checks without emitting; `dist/` and `out/` are
build artifacts and are gitignored.

## Test

```bash
npm test           # runs once (vitest run)
npm run test:watch # re-runs on change
```

Unit tests live next to the code they cover (`src/**/*.test.ts`), using
[vitest](https://vitest.dev). `vscode` is a virtual module the real
extension host injects at runtime - it doesn't resolve under a plain test
runner at all - so `vitest.config.ts` aliases it to
`src/test/vscode-mock.ts`, a hand-written stand-in covering only the APIs
this extension actually calls (`window.showQuickPick`/`createInputBox`,
`Range`/`Position`/`Uri`, `WorkspaceEdit`, `CodeActionKind`, ...), with real
behavior where tests care about it (offset↔line/character math, `Uri.joinPath`)
and `vi.fn()` stubs elsewhere that individual tests configure. `src/test/testDocument.ts`
builds a fake `TextDocument` from a plain string, and
`src/test/wizardTestHelpers.ts` provides queueable "accept this value" /
"cancel" / "fast-forward" responders for the wizard's QuickPick/InputBox
prompts.

Most tests run against the real bundled schemas (`schemas/*.schema.json`),
not synthetic fixtures, including a parametrized run of the wizard's
"fill everything else with defaults" fast-forward across **all 41**
`PipelineCommand` variants and every file type's creation wizard - the kind of exhaustive check that caught two
real bugs during development (a `break`/`continue` mixup that silently
dropped optional defaults for zero-required-field commands like
`GAUSSIAN_BLUR`, and a stray `minimum`-based fallback where a flat `0` was
wanted). `npm run vscode:prepublish` (and therefore `npm run package`) runs
the suite, so a broken build can't be packaged.

## Package and install

```bash
npm install
npm run package          # runs vscode:prepublish, then vsce package
code --install-extension evanalyzer-file-support-0.3.0.vsix
```

`npm run package` invokes `vsce package`, which first runs the
`vscode:prepublish` script (type-check + production esbuild bundle), then
zips up everything **not** excluded by `.vscodeignore` — currently `dist/`,
`schemas/`, `package.json`, `README.md`, `CHANGELOG.md`, and `LICENSE` — into
`evanalyzer-file-support-<version>.vsix`.

## Keeping schemas in sync

The schemas under `schemas/` are copies of the ones generated by the `cfg`
crate's build script into an evanalyzer checkout's `docs/`. If you change
the underlying Rust structs (`ProjectSettings`, `ProjectTemplate`,
`ModuleTemplate`, `AiLearningSettings`), rebuild the workspace to
regenerate `docs/*.schema.json`, then run:

```bash
./sync-schemas.sh                               # from the sibling ../evanalyzer
EVANALYZER_DIR=/path/to/evanalyzer ./sync-schemas.sh
```

and bump `version` in `package.json` before repackaging.

`sync-schemas.sh` also regenerates `schemas/*.editor.schema.json` (via
`scripts/build-editor-schemas.js`, which `npm run build`/`package` re-run
anyway, so this step can't go stale either way). These are the files
`jsonValidation` actually points at - VS Code's built-in JSON language
service doesn't merge `$ref` siblings, which is how the raw schemas encode
`PipelineCommand`'s tagged union (`{"type":"object", "properties":
{"type":{"const":"BLUR"}}, "required":["type"], "$ref":"#/$defs/BlurSettings"}`).
Left as-is, that pattern makes every command variant lose its discriminator
in the editor: no autocomplete on `type`, and even a fully valid file gets
flagged with a false "Matches multiple schemas when only one must validate"
error. The generated `*.editor.schema.json` files merge just that pattern
inline (not a full dereference - several defs are mutually recursive) so
the editor sees a clean, disambiguated schema. The wizard is unaffected: it
resolves `$ref` siblings itself at prompt time (`src/schema/resolve.ts`), so
it reads the raw schemas directly.

One residual limitation, inherent to VS Code's `oneOf` completion (not
fixable via schema changes): autocomplete for the `type` **value** itself
only appears for command variants with no required fields beyond `type`
(e.g. `BLUR`, `CELLPOSE`). Once `type` is set - however it got there -
property completion and validation work correctly for every variant.
