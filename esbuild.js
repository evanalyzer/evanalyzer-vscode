const esbuild = require("esbuild");
const fs = require("node:fs");

const production = process.argv.includes("--production");
const watch = process.argv.includes("--watch");

// Not cleaned between incremental watch rebuilds - only here, so a leftover
// dev sourcemap can't survive into a later production build (or vice versa).
fs.rmSync("dist", { recursive: true, force: true });

/** @type {import('esbuild').Plugin} */
const watchLogPlugin = {
  name: "watch-log",
  setup(build) {
    build.onStart(() => console.log("[watch] build started"));
    build.onEnd((result) => {
      for (const { text, location } of result.errors) {
        console.error(`> ${location ? `${location.file}:${location.line}:${location.column}: ` : ""}error: ${text}`);
      }
      console.log("[watch] build finished");
    });
  },
};

async function main() {
  const ctx = await esbuild.context({
    entryPoints: ["src/extension.ts"],
    bundle: true,
    format: "cjs",
    minify: production,
    sourcemap: !production,
    sourcesContent: false,
    platform: "node",
    outfile: "dist/extension.js",
    external: ["vscode"],
    logLevel: "silent",
    plugins: [watchLogPlugin],
  });

  if (watch) {
    await ctx.watch();
  } else {
    await ctx.rebuild();
    await ctx.dispose();
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
