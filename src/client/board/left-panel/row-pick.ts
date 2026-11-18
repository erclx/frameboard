/**
 * The rows from `target` to `anchor` in list order, ordered to end on the
 * anchor so a second Shift-click spans from the same row, or null when the
 * anchor is not among them.
 */
export function spanTo<T>(
  rows: readonly T[],
  anchor: T | undefined,
  target: T,
): T[] | null {
  const from = anchor === undefined ? -1 : rows.indexOf(anchor)
  const to = rows.indexOf(target)
  if (from === -1 || to === -1) return null
  const span = rows.slice(Math.min(from, to), Math.max(from, to) + 1)
  return from < to ? span.reverse() : span
}

/** Whether a row click adds or takes out one row, Cmd on macOS and Ctrl elsewhere. */
export function addsOne(event: { metaKey: boolean; ctrlKey: boolean }) {
  return event.metaKey || event.ctrlKey
}
