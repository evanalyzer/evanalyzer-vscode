import * as fs from "node:fs/promises";
import * as path from "node:path";
import type { RootSchemaFile } from "./types";

const cache = new Map<string, RootSchemaFile>();

/**
 * Loads (and caches) one of the bundled schema files from ./schemas relative
 * to the extension root. Schemas are static and ship inside the .vsix, so a
 * process-lifetime cache is safe.
 */
export async function loadSchema(extensionPath: string, fileName: string): Promise<RootSchemaFile> {
  const cached = cache.get(fileName);
  if (cached) {
    return cached;
  }

  const filePath = path.join(extensionPath, "schemas", fileName);
  const raw = await fs.readFile(filePath, "utf8");
  const parsed = JSON.parse(raw) as RootSchemaFile;
  cache.set(fileName, parsed);
  return parsed;
}
