import { defineConfig } from "vitest/config";
import path from "node:path";

export default defineConfig({
  test: {
    include: ["src/**/*.test.ts"],
    alias: {
      vscode: path.resolve(__dirname, "src/test/vscode-mock.ts"),
    },
  },
});
