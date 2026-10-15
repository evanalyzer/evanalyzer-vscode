import type { JsonPath } from "./schemaAtPath";

/**
 * The well-known array locations the CodeLens buttons and id suggestions
 * work on, identified by their JSON path rather than by key name alone -
 * key names aren't unique any more (`classes` also appears inside the
 * SCRIPT command and Otsu threshold settings, `steps` and `parameters`
 * appear both at a `.evacomp` root and inside every component definition).
 *
 * Component definitions live under `components` (`.evaproj`, `.evapt`) or
 * `uses` (`.evacomp`); a `.evacomp` root is itself a component definition.
 */

/** True for `[]` (a `.evacomp` root) or `["components"|"uses", i]`. */
function isComponentDefinitionPath(path: JsonPath, isComponentFile: boolean): boolean {
  if (path.length === 0) {
    return isComponentFile;
  }
  return path.length === 2 && path[0] === (isComponentFile ? "uses" : "components") && typeof path[1] === "number";
}

/** An array of `Class` entries: project classification, or a component's local classes. */
export function isClassArray(path: JsonPath, isComponentFile: boolean): boolean {
  if (path.length === 2 && path[0] === "classification" && path[1] === "classes") {
    return !isComponentFile;
  }
  return path[path.length - 1] === "classes" && isComponentDefinitionPath(path.slice(0, -1), isComponentFile);
}

/** The top-level `pipelines` array of a project or project template. */
export function isPipelinesArray(path: JsonPath, isComponentFile: boolean): boolean {
  return !isComponentFile && path.length === 1 && path[0] === "pipelines";
}

/** A list of `PipelineStepSettings`: a pipeline's steps, or a component definition's steps. */
export function isStepsArray(path: JsonPath, isComponentFile: boolean): boolean {
  if (path[path.length - 1] !== "steps") {
    return false;
  }
  const owner = path.slice(0, -1);
  if (!isComponentFile && owner.length === 2 && owner[0] === "pipelines" && typeof owner[1] === "number") {
    return true;
  }
  return isComponentDefinitionPath(owner, isComponentFile);
}

/** The array of `ComponentDefinition`s: `components` in projects/templates, `uses` in `.evacomp`. */
export function isComponentDefinitionsArray(path: JsonPath, isComponentFile: boolean): boolean {
  return path.length === 1 && path[0] === (isComponentFile ? "uses" : "components");
}

/** A component definition's `parameters` array. */
export function isParametersArray(path: JsonPath, isComponentFile: boolean): boolean {
  return path[path.length - 1] === "parameters" && isComponentDefinitionPath(path.slice(0, -1), isComponentFile);
}

/**
 * For a steps array path, the path of the component definition that owns
 * it, or undefined when it's a pipeline's steps. Used to keep a component
 * from offering itself as one of its own steps.
 */
export function owningComponentPath(stepsPath: JsonPath, isComponentFile: boolean): JsonPath | undefined {
  const owner = stepsPath.slice(0, -1);
  return isComponentDefinitionPath(owner, isComponentFile) ? owner : undefined;
}
