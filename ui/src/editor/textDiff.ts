/** One replacement that turns `before` into `after`: `before[from..to]` becomes `insert`. */
export interface TextChange {
  readonly from: number;
  readonly to: number;
  readonly insert: string;
}

/**
 * The smallest single change between two texts, found by trimming the common start and end.
 * Returns null when they are equal. Used to apply disk changes without moving the cursor.
 */
export function singleChange(before: string, after: string): TextChange | null {
  if (before === after) return null;

  let start = 0;
  const shortest = Math.min(before.length, after.length);
  while (start < shortest && before[start] === after[start]) start++;

  let endBefore = before.length;
  let endAfter = after.length;
  while (endBefore > start && endAfter > start && before[endBefore - 1] === after[endAfter - 1]) {
    endBefore--;
    endAfter--;
  }

  return { from: start, to: endBefore, insert: after.slice(start, endAfter) };
}
