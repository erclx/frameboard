export interface Drift {
  readonly changed: readonly string[]
  /** PNGs whose bytes differ, a warning since a PNG varies with the browser build. */
  readonly pngDiffers: readonly string[]
  readonly missing: readonly string[]
  readonly stray: readonly string[]
}

/** Compares what a sync would write against the files the folder holds, the HTML as the source and a PNG as derived. */
export function classifyDrift(
  expected: ReadonlyMap<string, string | Uint8Array>,
  tracked: ReadonlyMap<string, string | Uint8Array>,
): Drift {
  const changed: string[] = []
  const pngDiffers: string[] = []
  const missing: string[] = []
  for (const [path, data] of expected) {
    const copy = tracked.get(path)
    if (copy === undefined) missing.push(path)
    else if (!Buffer.from(copy).equals(Buffer.from(data))) {
      ;(path.endsWith('.png') ? pngDiffers : changed).push(path)
    }
  }
  const stray = [...tracked.keys()].filter((path) => !expected.has(path))
  return { changed, pngDiffers, missing, stray }
}
