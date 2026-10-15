/**
 * `id` fields are `required` with no usable schema `default` (there's
 * nothing static to default to), so they need a computed suggestion
 * instead: one past the highest id already used by a sibling array entry.
 */

/**
 * Class ids start at 1 - 0 is the background's. Matches evanalyzer's own
 * `next_class_id`: one above the highest, so a deleted class's id isn't
 * reused while old pipelines/results may still refer to it.
 */
export function nextClassId(classes: unknown): number {
  return Math.max(1, maxId(classes) + 1);
}

/** Step ids start at 1 - 0 is `StepId::UNASSIGNED`. Unique within one list of steps. */
export function nextStepId(steps: unknown): number {
  return Math.max(1, maxId(steps) + 1);
}

export function nextPipelineId(pipelines: unknown): number {
  return maxId(pipelines) + 1;
}

function maxId(entries: unknown): number {
  let max = -1;
  if (Array.isArray(entries)) {
    for (const entry of entries) {
      const id = (entry as Record<string, unknown> | undefined)?.id;
      if (typeof id === "number" && Number.isFinite(id)) {
        max = Math.max(max, id);
      }
    }
  }
  return max;
}
