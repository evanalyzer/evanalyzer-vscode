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

## 0.1.0

- Initial release: syntax highlighting and JSON Schema validation/autocomplete
  for `.evapipe`, `.evaproj`, and `.evapt` files.
