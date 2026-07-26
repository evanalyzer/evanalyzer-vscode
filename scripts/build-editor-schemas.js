#!/usr/bin/env node
"use strict";

/**
 * Generates *.editor.schema.json from each *.schema.json under ./schemas.
 *
 * Why: the raw schemas are valid JSON Schema 2020-12, where schemars emits
 * tagged-union variants as `$ref` *alongside* sibling keywords, e.g.:
 *
 *   { "type": "object", "properties": { "type": { "const": "blur" } },
 *     "required": ["type"], "$ref": "#/$defs/BlurSettings" }
 *
 * Per 2020-12, the sibling keywords still apply (unlike draft-07). VS Code's
 * built-in JSON language service (vscode-json-languageservice) does not
 * implement that: it drops the siblings and evaluates only the $ref target,
 * so every oneOf/anyOf variant with such a wrapper loses its discriminator.
 * This has been confirmed directly against vscode-json-languageservice: the
 * "type" field gets zero autocomplete, and even a fully valid document
 * (e.g. `{"type":"blur","kernelSize":5}`) is flagged with a false
 * "Matches multiple schemas when only one must validate" error, because
 * every ref-only variant ends up structurally compatible.
 *
 * The fix here is *not* a full dereference (several defs are mutually
 * recursive - fully inlining them would recurse forever). It only merges a
 * node's sibling keywords into its $ref target where both are present on
 * the same node, which is exactly the pattern that breaks vscode. Bare
 * `{ "$ref": "..." }` nodes (the vast majority) are left untouched - vscode
 * already resolves those correctly, and leaving them alone is what keeps
 * this transform safe in the presence of recursive defs.
 */

const fs = require("node:fs");
const path = require("node:path");

const SCHEMAS_DIR = path.join(__dirname, "..", "schemas");
const SOURCE_FILES = ["project.schema.json", "project_template.schema.json", "pipeline_template.schema.json"];

for (const fileName of SOURCE_FILES) {
  const srcPath = path.join(SCHEMAS_DIR, fileName);
  const root = JSON.parse(fs.readFileSync(srcPath, "utf8"));
  const defs = root.$defs || {};

  // Memoizes the merged (ref-free at the top level) form of each def, keyed
  // by def name. A def only ever needs this treatment once, however many
  // places reference it.
  const resolvedDefs = new Map();
  const inProgress = new Set();

  function resolveDef(name) {
    if (resolvedDefs.has(name)) {
      return resolvedDefs.get(name);
    }
    if (inProgress.has(name)) {
      // A def with $ref-siblings that (indirectly) refers back to itself.
      // Not expected in these schemas, but degrade to "leave as a bare
      // ref" rather than recursing forever.
      return { $ref: `#/$defs/${name}` };
    }
    inProgress.add(name);
    const transformed = transformNode(defs[name]);
    inProgress.delete(name);
    resolvedDefs.set(name, transformed);
    return transformed;
  }

  function mergeSiblingsIntoRef(node) {
    const refName = node.$ref.replace("#/$defs/", "");
    const base = resolveDef(refName);
    const overlay = { ...node };
    delete overlay.$ref;

    const required = Array.from(new Set([...(base.required || []), ...(overlay.required || [])]));
    const merged = { ...base, ...overlay };
    merged.description = overlay.description !== undefined ? overlay.description : base.description;
    merged.default = overlay.default !== undefined ? overlay.default : base.default;
    if (base.properties || overlay.properties) {
      merged.properties = { ...(base.properties || {}), ...(overlay.properties || {}) };
    }
    if (required.length > 0) {
      merged.required = required;
    } else {
      delete merged.required;
    }
    return merged;
  }

  function transformNode(node) {
    if (node === null || typeof node !== "object") {
      return node;
    }
    if (Array.isArray(node)) {
      return node.map(transformNode);
    }

    const hasRef = typeof node.$ref === "string";
    const hasSiblings = hasRef && Object.keys(node).some((k) => k !== "$ref");

    let working = node;
    if (hasRef && !hasSiblings) {
      // Bare $ref - leave untouched, vscode resolves this fine natively.
      return { $ref: node.$ref };
    }
    if (hasRef && hasSiblings) {
      working = mergeSiblingsIntoRef(node);
    }

    const out = {};
    for (const [key, value] of Object.entries(working)) {
      if (key === "$defs") {
        continue; // handled separately at the document root
      }
      out[key] = transformNode(value);
    }
    return out;
  }

  for (const name of Object.keys(defs)) {
    resolveDef(name);
  }

  const transformedDefs = {};
  for (const name of Object.keys(defs)) {
    transformedDefs[name] = resolvedDefs.get(name);
  }

  const rootWithoutDefs = { ...root };
  delete rootWithoutDefs.$defs;
  const transformedRoot = transformNode(rootWithoutDefs);
  transformedRoot.$defs = transformedDefs;

  const outName = fileName.replace(".schema.json", ".editor.schema.json");
  const outPath = path.join(SCHEMAS_DIR, outName);
  fs.writeFileSync(outPath, JSON.stringify(transformedRoot, null, 2) + "\n");
  console.log(`Wrote ${path.relative(process.cwd(), outPath)}`);
}
