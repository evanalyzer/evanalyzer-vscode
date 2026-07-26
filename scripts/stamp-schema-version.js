#!/usr/bin/env node
"use strict";

/**
 * Replaces the text between the `evanalyzer-schema-version` markers in
 * README.md with a line naming the evanalyzer release the bundled schemas
 * were fetched from (schemas/EVANALYZER_VERSION, written by
 * fetch-latest-schemas.js). Run after that script, before packaging, so
 * the stamped line ships inside the .vsix - not committed back to the
 * repo by this script; the release workflow's checkout is ephemeral.
 */

const fs = require("node:fs");
const path = require("node:path");

const README_PATH = path.join(__dirname, "..", "README.md");
const VERSION_PATH = path.join(__dirname, "..", "schemas", "EVANALYZER_VERSION");
const START = "<!-- evanalyzer-schema-version:start -->";
const END = "<!-- evanalyzer-schema-version:end -->";

function main() {
  const tag = fs.readFileSync(VERSION_PATH, "utf8").trim();
  if (!tag) {
    throw new Error(`${VERSION_PATH} is empty`);
  }

  const readme = fs.readFileSync(README_PATH, "utf8");
  const startIndex = readme.indexOf(START);
  const endIndex = readme.indexOf(END);
  if (startIndex === -1 || endIndex === -1 || endIndex < startIndex) {
    throw new Error(`README.md is missing the ${START} / ${END} marker pair`);
  }

  const releaseUrl = `https://github.com/evanalyzer/evanalyzer/releases/tag/${tag}`;
  const line = `Schemas last synced from evanalyzer [${tag}](${releaseUrl}).`;
  const replacement = `${START}\n${line}\n${END}`;

  const updated = readme.slice(0, startIndex) + replacement + readme.slice(endIndex + END.length);
  fs.writeFileSync(README_PATH, updated);
  console.log(`Stamped README.md with evanalyzer ${tag}`);
}

main();
