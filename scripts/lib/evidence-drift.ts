import { existsSync, readdirSync, readFileSync } from 'node:fs'
import { join, relative, sep } from 'node:path'

import { PNG } from 'pngjs'

/**
 * What Chromium's raster leaves different between two captures of one state.
 * Antialiased rounded corners land a little apart from run to run, and they sit
 * on every panel, so no mask can hold them. Measured at up to 130 pixels in a
 * frame and a channel delta of 44. A real change inside both limits, such as a
 * hairline token change on a small control, stays uncaptured.
 */
export const RASTER_TOLERANCE = { pixels: 200, channelDelta: 64 }

export type Match = 'identical' | 'raster' | 'different'

/** A tree of images, each path relative to its root mapped to its file. */
export type ImageFiles = ReadonlyMap<string, string>

export type MatchFiles = (a?: string, b?: string) => Match

export interface Drift {
  /** Images the two runs disagree on, so a re-capture cannot reproduce them. */
  noise: string[]
  /** Images both runs agree on that the committed set lacks or holds differently. */
  stale: string[]
  equal: string[]
  /** The images in `equal` that matched only within the raster tolerance. */
  tolerated: string[]
}

export function listImages(root: string): Map<string, string> {
  const files = new Map<string, string>()
  if (!existsSync(root)) return files
  for (const entry of readdirSync(root, {
    recursive: true,
    withFileTypes: true,
  })) {
    if (!entry.isFile() || !entry.name.endsWith('.png')) continue
    const file = join(entry.parentPath, entry.name)
    files.set(relative(root, file).split(sep).join('/'), file)
  }
  return files
}

export function matchImages(a: Buffer, b: Buffer): Match {
  if (a.equals(b)) return 'identical'
  const first = PNG.sync.read(a)
  const second = PNG.sync.read(b)
  if (first.width !== second.width || first.height !== second.height) {
    return 'different'
  }
  let pixels = 0
  for (let at = 0; at < first.data.length; at += 4) {
    let delta = 0
    for (let channel = at; channel < at + 4; channel++) {
      const moved = Math.abs(
        (first.data[channel] ?? 0) - (second.data[channel] ?? 0),
      )
      if (moved > delta) delta = moved
    }
    if (delta > RASTER_TOLERANCE.channelDelta) return 'different'
    if (delta > 0 && ++pixels > RASTER_TOLERANCE.pixels) return 'different'
  }
  return pixels === 0 ? 'identical' : 'raster'
}

export const matchFiles: MatchFiles = (a, b) => {
  if (a === undefined && b === undefined) return 'identical'
  if (a === undefined || b === undefined) return 'different'
  return matchImages(readFileSync(a), readFileSync(b))
}

/**
 * Sorts every image any of the three trees holds into exactly one list, so the
 * counts sum to the whole set. A committed image neither run wrote is stale,
 * since both runs agree it is gone.
 */
export function sortDrift(
  committed: ImageFiles,
  first: ImageFiles,
  second: ImageFiles,
  match: MatchFiles = matchFiles,
): Drift {
  const drift: Drift = { noise: [], stale: [], equal: [], tolerated: [] }
  const images = new Set([
    ...committed.keys(),
    ...first.keys(),
    ...second.keys(),
  ])
  for (const image of [...images].sort()) {
    const between = match(first.get(image), second.get(image))
    const against = match(first.get(image), committed.get(image))
    if (between === 'different') drift.noise.push(image)
    else if (against === 'different') drift.stale.push(image)
    else {
      drift.equal.push(image)
      if (between === 'raster' || against === 'raster') {
        drift.tolerated.push(image)
      }
    }
  }
  return drift
}

/** The captured images a committed set should take, so a raster difference alone rewrites nothing. */
export function changedImages(
  captured: ImageFiles,
  committed: ImageFiles,
  match: MatchFiles = matchFiles,
): string[] {
  return [...captured.keys()]
    .sort()
    .filter(
      (image) =>
        match(captured.get(image), committed.get(image)) === 'different',
    )
}
