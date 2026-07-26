#!/usr/bin/env node
"use strict";

/**
 * Actually `require()`s dist/extension.js (with a stub `vscode` module) to
 * catch bundling problems that `tsc --noEmit` and `vsce package` cannot:
 * neither one ever executes the bundle. This exists because esbuild's
 * node-platform default (mainFields: ["main"]) silently produced a
 * dist/extension.js that type-checked and packaged fine, but threw
 * "Cannot find module './impl/format'" the moment VS Code actually tried
 * to activate the extension - a runtime-only failure from bundling
 * jsonc-parser's UMD build instead of its ESM one.
 */

const Module = require("node:module");
const path = require("node:path");

const bundlePath = path.join(__dirname, "..", "dist", "extension.js");

const originalResolve = Module._resolveFilename;
Module._resolveFilename = function (request, ...rest) {
  if (request === "vscode") {
    const err = new Error("__vscode_stub_reached__");
    err.code = "STUB_VSCODE";
    throw err;
  }
  return originalResolve.call(this, request, ...rest);
};

try {
  require(bundlePath);
  console.error("smoke-test-bundle: FAIL - module loaded without ever requiring 'vscode', which is unexpected for an extension entry point");
  process.exit(1);
} catch (err) {
  if (err && err.code === "STUB_VSCODE") {
    console.log("smoke-test-bundle: OK (dist/extension.js loads cleanly up to its `vscode` import)");
    process.exit(0);
  }
  console.error("smoke-test-bundle: FAIL - dist/extension.js threw while loading:");
  console.error(err);
  process.exit(1);
}
