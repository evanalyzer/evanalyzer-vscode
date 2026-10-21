import type { JsonPath } from "./schemaAtPath";

/**
 * The well-known array locations the CodeLens buttons and id suggestions
 * work on, identified by their JSON path rather than by key name alone -
 * key names aren't unique any more (`classes` also appears inside the
 * SCRIPT command and Otsu threshold settings, `steps` and `parameters`
 * appear both at a `.evamodule` root and inside every module definition).
 *
 * Module definitions live under `modules` (`.evaproj`, `.evatemplate`) or
 * `uses` (`.evamodule`); a `.evamodule` root is itself a module definition.
 */

/** True for `[]` (a `.evamodule` root) or `["modules"|"uses", i]`. */
function isModuleDefinitionPath(path: JsonPath, isModuleFile: boolean): boolean {
  if (path.length === 0) {
    return isModuleFile;
  }
  return path.length === 2 && path[0] === (isModuleFile ? "uses" : "modules") && typeof path[1] === "number";
}

/** An array of `Class` entries: project classification, or a module's local classes. */
export function isClassArray(path: JsonPath, isModuleFile: boolean): boolean {
  if (path.length === 2 && path[0] === "classification" && path[1] === "classes") {
    return !isModuleFile;
  }
  return path[path.length - 1] === "classes" && isModuleDefinitionPath(path.slice(0, -1), isModuleFile);
}

/** The top-level `pipelines` array of a project or project template. */
export function isPipelinesArray(path: JsonPath, isModuleFile: boolean): boolean {
  return !isModuleFile && path.length === 1 && path[0] === "pipelines";
}

/** A list of `PipelineStepSettings`: a pipeline's steps, or a module definition's steps. */
export function isStepsArray(path: JsonPath, isModuleFile: boolean): boolean {
  if (path[path.length - 1] !== "steps") {
    return false;
  }
  const owner = path.slice(0, -1);
  if (!isModuleFile && owner.length === 2 && owner[0] === "pipelines" && typeof owner[1] === "number") {
    return true;
  }
  return isModuleDefinitionPath(owner, isModuleFile);
}

/** The array of `ModuleDefinition`s: `modules` in projects/templates, `uses` in `.evamodule`. */
export function isModuleDefinitionsArray(path: JsonPath, isModuleFile: boolean): boolean {
  return path.length === 1 && path[0] === (isModuleFile ? "uses" : "modules");
}

/** A module definition's `parameters` array. */
export function isParametersArray(path: JsonPath, isModuleFile: boolean): boolean {
  return path[path.length - 1] === "parameters" && isModuleDefinitionPath(path.slice(0, -1), isModuleFile);
}

/**
 * For a steps array path, the path of the module definition that owns
 * it, or undefined when it's a pipeline's steps. Used to keep a module
 * from offering itself as one of its own steps.
 */
export function owningModulePath(stepsPath: JsonPath, isModuleFile: boolean): JsonPath | undefined {
  const owner = stepsPath.slice(0, -1);
  return isModuleDefinitionPath(owner, isModuleFile) ? owner : undefined;
}
