import { describe, expect, it } from "vitest";
import { isClassArray, isModuleDefinitionsArray, isParametersArray, isPipelinesArray, isStepsArray, owningModulePath } from "./locations";

describe("locations in a project / project template", () => {
  it("recognises class arrays", () => {
    expect(isClassArray(["classification", "classes"], false)).toBe(true);
    expect(isClassArray(["modules", 0, "classes"], false)).toBe(true);
    // SCRIPT command's `classes` is a list of ObjectClass references, not Class definitions.
    expect(isClassArray(["pipelines", 0, "steps", 1, "command", "classes"], false)).toBe(false);
    expect(isClassArray(["classes"], false)).toBe(false);
  });

  it("recognises step lists of pipelines and module definitions", () => {
    expect(isStepsArray(["pipelines", 2, "steps"], false)).toBe(true);
    expect(isStepsArray(["modules", 0, "steps"], false)).toBe(true);
    expect(isStepsArray(["steps"], false)).toBe(false);
    expect(isStepsArray(["uses", 0, "steps"], false)).toBe(false);
  });

  it("recognises pipelines, module definitions and parameters", () => {
    expect(isPipelinesArray(["pipelines"], false)).toBe(true);
    expect(isModuleDefinitionsArray(["modules"], false)).toBe(true);
    expect(isModuleDefinitionsArray(["uses"], false)).toBe(false);
    expect(isParametersArray(["modules", 1, "parameters"], false)).toBe(true);
  });
});

describe("locations in a .evamodule", () => {
  it("treats the root as a module definition and uses[] as the others", () => {
    expect(isClassArray(["classes"], true)).toBe(true);
    expect(isClassArray(["uses", 0, "classes"], true)).toBe(true);
    expect(isClassArray(["classification", "classes"], true)).toBe(false);
    expect(isStepsArray(["steps"], true)).toBe(true);
    expect(isStepsArray(["uses", 3, "steps"], true)).toBe(true);
    expect(isPipelinesArray(["pipelines"], true)).toBe(false);
    expect(isModuleDefinitionsArray(["uses"], true)).toBe(true);
    expect(isParametersArray(["parameters"], true)).toBe(true);
  });
});

describe("owningModulePath", () => {
  it("names the definition that owns a step list, or nothing for a pipeline's", () => {
    expect(owningModulePath(["modules", 1, "steps"], false)).toEqual(["modules", 1]);
    expect(owningModulePath(["steps"], true)).toEqual([]);
    expect(owningModulePath(["pipelines", 0, "steps"], false)).toBeUndefined();
  });
});
