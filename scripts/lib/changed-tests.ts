const TEST_FILE = /\.test\.tsx?$/

/** A path up to its file name's first dot, which a test shares with its source. */
function subject(path: string): string {
  const start = path.lastIndexOf('/') + 1
  const dot = path.indexOf('.', start + 1)
  return dot === -1 ? path : path.slice(0, dot)
}

/**
 * The Vitest files in `files` that changed or sit beside a changed file under
 * its name, sorted. Imports are not followed, since a shared module's import
 * chain reaches most of the suite, which CI runs whole.
 */
export function tiedTests(
  changed: readonly string[],
  files: readonly string[],
): string[] {
  const subjects = new Set(changed.map(subject))
  return files
    .filter((file) => TEST_FILE.test(file) && subjects.has(subject(file)))
    .toSorted()
}
