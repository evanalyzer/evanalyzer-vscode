# Changelog

## 0.2.0

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
  CodeLens buttons above the relevant arrays. Add Class/Pipeline fill in
  everything that's unambiguously computable (id, a generated distinct
  color, `imageSource: "SCRATCHPAD"`, `enabled: true`, `creationTime`,
  author fields inherited from the file's own top-level `meta`) and leave
  genuine free-text fields (name, description, ...) for the native
  "Missing property" diagnostic rather than inserting placeholder text.
  Add Pipeline Command reuses the creation wizard (prompts which of the 31
  command types, then its fields) since there's no sensible non-interactive
  choice among that many variants.

## 0.1.0

- Initial release: syntax highlighting and JSON Schema validation/autocomplete
  for `.evapipe`, `.evaproj`, and `.evapt` files.
