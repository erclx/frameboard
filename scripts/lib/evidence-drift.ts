import { createHash } from 'node:crypto'
import { readdirSync, readFileSync } from 'node:fs'
import { join, relative, sep } from 'node:path'

/** A tree of images, each path relative to its root mapped to its bytes' hash. */
export type ImageHashes = ReadonlyMap<string, string>

export interface Drift {
  /** Images the two runs disagree on, so a re-capture cannot reproduce them. */
  noise: string[]
  /** Images both runs agree on that the committed set lacks or holds differently. */
  stale: string[]
  equal: string[]
}

export function hashImages(root: string): Map<string, string> {
  const hashes = new Map<string, string>()
  for (const entry of readdirSync(root, {
    recursive: true,
    withFileTypes: true,
  })) {
    if (!entry.isFile() || !entry.name.endsWith('.png')) continue
    const file = join(entry.parentPath, entry.name)
    const image = relative(root, file).split(sep).join('/')
    hashes.set(
      image,
      createHash('sha256').update(readFileSync(file)).digest('hex'),
    )
  }
  return hashes
}

/**
 * Sorts every image any of the three trees holds into exactly one list, so the
 * counts sum to the whole set. A committed image neither run wrote is stale,
 * since both runs agree it is gone.
 */
export function sortDrift(
  committed: ImageHashes,
  first: ImageHashes,
  second: ImageHashes,
): Drift {
  const drift: Drift = { noise: [], stale: [], equal: [] }
  const images = new Set([
    ...committed.keys(),
    ...first.keys(),
    ...second.keys(),
  ])
  for (const image of [...images].sort()) {
    if (first.get(image) !== second.get(image)) drift.noise.push(image)
    else if (first.get(image) !== committed.get(image)) drift.stale.push(image)
    else drift.equal.push(image)
  }
  return drift
}
