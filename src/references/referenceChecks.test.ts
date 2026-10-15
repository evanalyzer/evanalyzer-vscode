import { parseTree } from "jsonc-parser";
import { describe, expect, it } from "vitest";
import { checkReferences } from "./referenceChecks";

function check(value: unknown, isComponentFile = false) {
  const text = JSON.stringify(value);
  return checkReferences(parseTree(text)!, isComponentFile).map((issue) => ({
    text: text.slice(issue.offset, issue.offset + issue.length),
    message: issue.message,
    severity: issue.severity,
  }));
}

const smooth = {
  key: "SMOOTH",
  meta: { name: "Smooth" },
  classes: [{ id: 1 }],
  steps: [
    { id: 1, enabled: true, command: { type: "BLUR" } },
    { id: 2, enabled: true, command: { type: "EXTRACT_OBJECTS", classMapping: [{ objectClass: { LOCAL: 1 } }] } },
  ],
  parameters: [{ key: "kernel", label: "Kernel", default: 3, bindings: [{ step: 1, param: "kernel_size" }] }],
};

describe("checkReferences", () => {
  it("accepts a consistent project", () => {
    const project = {
      classification: { classes: [{ id: 1 }, { id: 2 }] },
      components: [smooth],
      pipelines: [
        {
          id: 0,
          steps: [
            { id: 1, enabled: true, component: { key: "SMOOTH", values: { kernel: 5 } } },
            { id: 2, enabled: true, command: { type: "CLASSIFY_OBJECTS", inputClasses: [{ GLOBAL: 2 }] } },
          ],
        },
      ],
    };
    expect(check(project)).toEqual([]);
  });

  it("flags an unknown component key and an unknown parameter", () => {
    const issues = check({
      components: [smooth],
      pipelines: [
        {
          id: 0,
          steps: [
            { id: 1, component: { key: "MISSING" } },
            { id: 2, component: { key: "SMOOTH", values: { kernel: 5, sigma: 1 } } },
          ],
        },
      ],
    });
    expect(issues).toEqual([
      { text: '"MISSING"', message: 'Unknown component "MISSING".', severity: "error" },
      { text: '"sigma"', message: 'Component "SMOOTH" has no parameter "sigma".', severity: "warning" },
    ]);
  });

  it("flags a component that uses itself", () => {
    const issues = check({ components: [{ ...smooth, steps: [{ id: 1, component: { key: "SMOOTH" } }], parameters: [] }] });
    expect(issues.map((i) => i.message)).toContain('Component "SMOOTH" can\'t use itself.');
  });

  it("flags a binding to a step id the component doesn't have", () => {
    const issues = check({ components: [{ ...smooth, parameters: [{ key: "k", bindings: [{ step: 9, param: "x" }] }] }] });
    expect(issues).toEqual([{ text: "9", message: 'Component "SMOOTH" has no step with id 9.', severity: "error" }]);
  });

  it("treats duplicate step ids as an error in a component but a warning in a pipeline, and ignores unassigned 0s", () => {
    const issues = check({
      components: [{ key: "A", steps: [{ id: 1 }, { id: 1 }], parameters: [] }],
      pipelines: [{ id: 0, steps: [{ id: 3 }, { id: 3 }, { id: 0 }, { id: 0 }] }],
    });
    expect(issues.map((i) => [i.text, i.severity])).toEqual([
      ["1", "error"],
      ["3", "warning"],
    ]);
  });

  it("flags duplicate class ids, pipeline ids, component keys and parameter keys", () => {
    const issues = check({
      classification: { classes: [{ id: 1 }, { id: 1 }] },
      components: [
        { key: "A", parameters: [{ key: "p" }, { key: "p" }] },
        { key: "A", parameters: [] },
      ],
      pipelines: [{ id: 0 }, { id: 0 }],
    });
    expect(issues.map((i) => i.message).sort()).toEqual(
      ['Duplicate class id 1.', 'Duplicate component key "A".', 'Duplicate parameter key "p".', "Duplicate pipeline id 0."].sort()
    );
  });

  it("flags LOCAL classes outside a component, and ones the component doesn't define", () => {
    const issues = check({
      components: [{ key: "A", classes: [{ id: 1 }], steps: [{ id: 1, command: { outputClass: { LOCAL: 4 } } }], parameters: [] }],
      pipelines: [{ id: 0, steps: [{ id: 1, command: { outputClass: { LOCAL: 1 } } }] }],
    });
    expect(issues).toEqual([
      { text: "4", message: 'Component "A" has no local class with id 4.', severity: "warning" },
      { text: '{"LOCAL":1}', message: "LOCAL classes are only valid inside a component definition.", severity: "error" },
    ]);
  });

  it("flags GLOBAL classes missing from a project's classification", () => {
    const issues = check({ classification: { classes: [{ id: 1 }] }, pipelines: [{ id: 0, steps: [{ command: { c: { GLOBAL: 7 } } }] }] });
    expect(issues).toEqual([{ text: "7", message: "No class with id 7 in classification.classes.", severity: "warning" }]);
  });

  describe("in a .evacomp", () => {
    it("resolves component steps against uses, checks the root's own bindings/LOCAL classes, and skips GLOBAL checks", () => {
      const component = {
        ...smooth,
        key: "ROOT",
        steps: [...smooth.steps, { id: 3, component: { key: "SMOOTH", values: { kernel: 1 } } }, { id: 4, command: { c: { GLOBAL: 99 } } }],
        uses: [smooth],
      };
      expect(check(component, true)).toEqual([]);
    });

    it("scopes LOCAL classes to the innermost component definition", () => {
      const component = {
        key: "ROOT",
        classes: [{ id: 1 }],
        steps: [],
        parameters: [],
        uses: [{ key: "INNER", classes: [{ id: 2 }], steps: [{ id: 1, command: { c: { LOCAL: 1 } } }], parameters: [] }],
      };
      expect(check(component, true).map((i) => i.message)).toEqual(['Component "INNER" has no local class with id 1.']);
    });
  });
});
