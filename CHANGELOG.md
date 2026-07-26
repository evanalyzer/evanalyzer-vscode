# Changelog

## 0.2.0

- Added a release pipeline (`.github/workflows/release.yml`), triggered by
  pushing a plain semver tag (e.g. `git tag 0.0.2 && git push --tags`):
  stamps `package.json`'s version from the tag, fetches the three schemas
  from the *latest* `evanalyzer/evanalyzer` GitHub release (`npm run
  schemas:fetch-latest` - confirmed against the real repo that schemas
  aren't published as release assets, just committed `docs/*.schema.json`
  files, so this pulls them via `raw.githubusercontent.com` at that
  release's tag), stamps a "schemas last synced from evanalyzer `<version>`"
  line into `README.md` (so it ships inside the `.vsix` and shows in the
  release notes), runs the full existing build/test/package pipeline, and
  attaches the `.vsix` to a GitHub release for the pushed tag. Verified the
  fetch script for real (not just written blind): it correctly pulled
  `evanalyzer` `0.1.0-alpha.18`'s schemas, and the full test suite (all 81
  tests) still passed against them. The workflow YAML was validated with
  `actionlint`, including confirming it actually catches real errors
  (tested against a deliberately broken copy) rather than silently passing
  everything.
- Added a second, **manual-only** job (`publish-marketplace`) for
  publishing to the VS Code Marketplace - it never runs from a tag push,
  only when the workflow is run by hand with its checkbox enabled, and even
  then only if the `VSCE_PAT` repository secret has been configured (it
  isn't yet - see the job's comment in the workflow file for setup steps,
  including an optional GitHub Environment for a manual-approval gate).
  Deliberately prepared but inert until that secret exists.
- Added the extension icon (`assets/icon.png`, 615×615, wired into
  `package.json`'s `icon` field for the Marketplace listing / Extensions
  view). Moved out of `src/assets/` since that directory is excluded from
  the packaged `.vsix`.
- Added a unit test suite (`npm test`, vitest): 81 tests across schema
  resolution/path-walking, id/color generation, the wizard's cancel and
  fast-forward semantics (including a parametrized run across all 31
  `PipelineCommand` variants), and the color picker / CodeLens providers.
  Most run against the real bundled schemas rather than synthetic
  fixtures. `vscode` is aliased to a hand-written mock (`src/test/vscode-mock.ts`)
  covering only the APIs this extension actually calls, since it's
  otherwise a virtual module the real extension host injects at runtime
  and doesn't resolve at all under a plain test runner. Wired into
  `vscode:prepublish`, so `npm run package` can't ship a build with
  failing tests.
- Fixed the append ("add at the end") **+ Add Pipeline Command** button
  being anchored above the array - i.e. visually before the *first* item -
  so it just looked like a second "insert before item 0" button, with
  nothing distinctly marking "the end". Re-anchored it at the array's
  closing bracket instead, after the last "insert before item N" button.
  Verified against the real test file: each button now lands on the
  expected line, and an empty pipeline's steps array correctly gets just
  the one trailing button.
- Fixed "Done - fill everything else with defaults" doing nothing for
  commands with zero required fields (e.g. `gaussianBlur`, whose
  `kernelSize`/`sigma` are both optional-with-default): clicking that
  choice from the optional-fields picker itself set the fast-forward flag
  and `break`-ed out of the loop immediately, skipping the very code that
  fills defaults in - it needed to `continue` so the loop's own
  fast-forward branch actually ran. My first verification pass (an
  exhaustive check across all 31 command types) missed this because it
  only checked the *result validates*, and a command with its optional
  fields simply absent is still valid - it doesn't check *the fields
  actually got filled in*. Re-verified with a stricter test that checks
  every default-bearing property is actually present: all 31 command
  types now pass, including `gaussianBlur` specifically.
- Simplified the wizard's zero-value fallback for numbers with no schema
  default: always `0` now, rather than falling back to the field's
  `minimum` constraint when one existed. Exhaustively verified (via a real
  JSON Schema validator, not spot checks) that fast-forwarding every one of
  the 31 pipeline command types still produces a fully schema-valid result
  under this simpler rule.
- Added an **+ Add Pipeline Command** CodeLens above every existing step,
  not just above the array - so a command can be inserted at any position,
  not only appended at the end. Verified against the real (now-larger) test
  file that the count of buttons matches exactly (1 append button + 1 per
  existing step, per pipeline).
- Fixed the CodeLens buttons, color picker, and Quick Fix only ever
  working right after using a command (New Project..., Add Pipeline, ...)
  and going silent after any window/extension-host reload. `package.json`
  had no explicit `activationEvents`; VS Code auto-generates `onCommand:X`
  for declared commands, but has no way to infer that `activate()` *also*
  registers CodeLens/Color/CodeAction providers - that's arbitrary code it
  can't see in advance. So the extension only ever activated by actually
  running a command, never by opening a file. JSON validation/syntax
  highlighting were unaffected, since those are handled entirely by VS
  Code's built-in JSON language service reading `jsonValidation`/
  `languages` from `package.json` directly, with no dependency on our
  `activate()` running at all - which is exactly why that part kept
  working while the buttons silently disappeared, and why it looked
  inconsistent rather than fully broken. Added `"activationEvents":
  ["onLanguage:json"]`, matching what VS Code's own JSON-related built-ins
  (`json-language-features`, `npm`, `configuration-editing`) use for the
  same reason. Confirmed via the extension host log: everything else
  (manifest, activation, bundle, the CodeLens array-detection logic
  against the actual file content) was already correct - this was the
  one real gap.

- Added a fast-track through the creation wizard (and Add Pipeline
  Command): every prompt now offers a **"Done - fill everything else with
  defaults"** choice (a QuickPick item, or a title-bar button on text/number
  inputs) alongside its normal choices. Picking it at any point immediately
  finishes the *entire* wizard - however deeply nested - using each
  remaining field's schema default, or a type-appropriate empty/zero value
  if it has none, with no further prompts. Optional fields that have a
  schema default are still included when fast-forwarding (e.g. a `blur`
  command's `kernelSize: 3`), matching what the **Fill in default values**
  Quick Fix would add; optional fields with no default are left out, same
  as always. Verified against mocked prompt sequences: fast-forwarding on
  the very first prompt, mid-flow, and on a `oneOf` variant picker (falls
  back to the first declared variant, e.g. `blur`, then fills it
  completely) all produce a fully valid skeleton.

- Added schema-driven creation wizards: **EVAnalyzer: New Project...**,
  **New Project Template...**, and **New Pipeline Template...**, available
  from the Command Palette and the Explorer's right-click "New EVAnalyzer
  File" submenu. Each walks the relevant JSON Schema, prompting only for
  required fields (with the option to add optional ones), and writes a
  valid `.evaproj` / `.evapt` / `.evapipe` file.
- Fixed pipeline command editing (`command.type` and friends): VS Code's
  built-in JSON language service doesn't merge `$ref` siblings the way the
  schemas use them for tagged unions, which caused missing autocomplete and
  false "Matches multiple schemas when only one must validate" errors on
  valid files. `jsonValidation` now points at generated
  `schemas/*.editor.schema.json` files (see `scripts/build-editor-schemas.js`)
  with just that pattern flattened. Property completion and validation now
  work correctly for every command type once `type` is set; autocomplete
  *for the `type` value itself* is only available for command types that
  have no other required fields (e.g. `blur`, `cellpose`) - this is an
  inherent limitation of how VS Code resolves `oneOf` value suggestions,
  not something a schema change can work around.
- Added a **Fill in default values** Quick Fix (`Ctrl+.`): on any JSON object
  in a `.evapipe`/`.evaproj`/`.evapt` file, inserts every not-yet-present
  property that has a schema `default` - e.g. setting a pipeline command's
  `type` and then running the fix adds its optional settings (`kernelSize`
  for `blur`, etc.). Required properties with no default are deliberately
  left out, since those already get a native "Missing property" diagnostic -
  the two behaviors are complementary rather than overlapping. Not specific
  to commands: works on any recognized object, including classification
  entries. Also suggests the next unused id for `Class.id` and (`.evaproj`
  only) `PipelineSettings.id`, computed from sibling array entries - these
  are required with no static default, so this is a special case on top of
  the schema-default logic above.
- Added a native color swatch + picker for `Class.color` (confirmed against
  the Rust source: it's a `u32` serialized as `#rrggbb` hex, no alpha).
  Click the swatch to change it; VS Code writes the new value back in the
  same format.
- Added **+ Add Class**, **+ Add Pipeline**, and **+ Add Pipeline Command**
  CodeLens buttons above the relevant arrays. Add Class/Pipeline produce a
  complete, immediately-valid skeleton: computed/generated values where
  there's something sensible to compute (id, a generated distinct color,
  `imageSource: "SCRATCHPAD"`, `enabled: true`, `creationTime`, author
  fields inherited from the file's own top-level `meta`), and an empty
  string for genuine free-text fields (name, description, ...) so they're
  immediately visible and editable rather than left out. Add Pipeline
  Command reuses the creation wizard (prompts which of the 31 command
  types, then its fields) since there's no sensible non-interactive choice
  among that many variants.
- Fixed the creation wizard (and Add Pipeline Command) so cancelling
  (`Esc`) a single field no longer discards the whole thing. Only
  cancelling the *first* prompt of a run aborts it - that's the "I didn't
  mean to click this" escape hatch. Every prompt after that is
  individually skippable: `Esc` fills that field with its schema default,
  or a type-appropriate empty string / `0` / `false` if it has none, and
  the wizard keeps going until it produces a complete, valid skeleton.
  Verified against mocked cancel sequences for both plain-object schemas
  and `oneOf` variant pickers (e.g. picking `distanceTransform` and then
  cancelling its `threshold`/`edgesAreBackground` prompts still yields a
  valid command).
- Fixed a bug that broke the extension entirely: esbuild's Node-platform
  default (`mainFields: ["main"]`) bundled `jsonc-parser`'s UMD build,
  which does a runtime `require('./impl/...')` that doesn't survive being
  bundled into a single file - `dist/extension.js` threw immediately on
  activation (`Cannot find module './impl/format'`), so *no* command,
  Quick Fix, CodeLens, or color picker worked, though a stale
  previously-loaded copy could briefly appear to work until the extension
  host reloaded. Fixed by preferring each package's `module` (ESM) entry
  point (`mainFields: ["module", "main"]`). Added
  `scripts/smoke-test-bundle.js` - it actually `require()`s the built
  bundle and fails the build if that throws - wired into
  `build`/`vscode:prepublish`, since neither `tsc --noEmit` nor
  `vsce package` ever execute the code and so could not have caught this.

## 0.1.0

- Initial release: syntax highlighting and JSON Schema validation/autocomplete
  for `.evapipe`, `.evaproj`, and `.evapt` files.
