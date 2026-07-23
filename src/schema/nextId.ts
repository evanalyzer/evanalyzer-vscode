/**
 * `id` fields are `required` with no schema `default` (there's nothing
 * static to default to), so they need a computed suggestion instead:
 * one past the highest id already used by a sibling array entry.
 */
export function nextClassId(classes: unknown): number {
  let max = -1;
  if (Array.isArray(classes)) {
    for (const entry of classes) {
      const id = (entry as Record<string, unknown> | undefined)?.id;
      const valid = (id as Record<string, unknown> | undefined)?.VALID;
      if (typeof valid === "number" && Number.isFinite(valid)) {
        max = Math.max(max, valid);
      }
    }
  }
  return max + 1;
}

export function nextPipelineId(pipelines: unknown): number {
  let max = -1;
  if (Array.isArray(pipelines)) {
    for (const entry of pipelines) {
      const id = (entry as Record<string, unknown> | undefined)?.id;
      if (typeof id === "number" && Number.isFinite(id)) {
        max = Math.max(max, id);
      }
    }
  }
  return max + 1;
}
