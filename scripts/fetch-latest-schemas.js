#!/usr/bin/env node
"use strict";

/**
 * Downloads the three JSON schemas from the *latest* published GitHub
 * release of evanalyzer/evanalyzer, overwriting schemas/*.schema.json.
 * Used by the release pipeline (see .github/workflows/release.yml) - not
 * part of the local dev workflow, which uses sync-schemas.sh against a
 * sibling checkout instead.
 *
 * evanalyzer doesn't publish schemas as release assets - confirmed against
 * the real repo before writing this. They're just committed files
 * (docs/*.schema.json), regenerated locally by that repo's own build
 * script and checked in as part of normal development. A release tag pins
 * a commit, so docs/*.schema.json at that tag's ref *is* "the schemas for
 * that release" - fetched here via raw.githubusercontent.com rather than
 * needing evanalyzer's own CI to change.
 *
 * Writes the release tag it used to schemas/EVANALYZER_VERSION, and (only
 * when running in GitHub Actions) appends `evanalyzer_version=<tag>` to
 * $GITHUB_OUTPUT for later steps to read.
 */

const fs = require("node:fs");
const path = require("node:path");
const https = require("node:https");

const REPO = "evanalyzer/evanalyzer";
const SCHEMAS_DIR = path.join(__dirname, "..", "schemas");
const FILES = ["pipeline_template.schema.json", "project.schema.json", "project_template.schema.json"];

function fetchText(url, redirectsLeft = 5) {
  return new Promise((resolve, reject) => {
    https
      .get(url, { headers: { "User-Agent": "evanalyzer-vscode-release-pipeline" } }, (res) => {
        const status = res.statusCode ?? 0;
        if (status >= 300 && status < 400 && res.headers.location && redirectsLeft > 0) {
          res.resume();
          resolve(fetchText(res.headers.location, redirectsLeft - 1));
          return;
        }
        if (status !== 200) {
          reject(new Error(`GET ${url} -> HTTP ${status}`));
          res.resume();
          return;
        }
        const chunks = [];
        res.on("data", (chunk) => chunks.push(chunk));
        res.on("end", () => resolve(Buffer.concat(chunks).toString("utf8")));
      })
      .on("error", reject);
  });
}

async function main() {
  const releaseJson = await fetchText(`https://api.github.com/repos/${REPO}/releases/latest`);
  const release = JSON.parse(releaseJson);
  const tag = release.tag_name;
  if (!tag) {
    throw new Error(`Could not determine the latest release tag for ${REPO}: ${releaseJson.slice(0, 500)}`);
  }
  console.log(`Latest ${REPO} release: ${tag}`);

  for (const file of FILES) {
    const url = `https://raw.githubusercontent.com/${REPO}/${tag}/docs/${file}`;
    const text = await fetchText(url);
    JSON.parse(text); // fail fast on a malformed/HTML (e.g. 404 page) download rather than writing garbage
    fs.writeFileSync(path.join(SCHEMAS_DIR, file), text);
    console.log(`Wrote schemas/${file} (from ${url})`);
  }

  fs.writeFileSync(path.join(SCHEMAS_DIR, "EVANALYZER_VERSION"), `${tag}\n`);

  const githubOutput = process.env.GITHUB_OUTPUT;
  if (githubOutput) {
    fs.appendFileSync(githubOutput, `evanalyzer_version=${tag}\n`);
  }
}

main().catch((err) => {
  console.error(err.message ?? err);
  process.exit(1);
});
