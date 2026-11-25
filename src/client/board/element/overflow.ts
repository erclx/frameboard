import type { FrameRecord } from '@/shared/records/list'
import type { Theme } from '@/shared/theme'

import type { Box } from '../geometry/box'
import type { ElementKey } from '../selection'

/**
 * Whether anything draws past a frame's edge, which a scroll frame and the one
 * screen a device body shows reach by scrolling. A record carries `device`
 * only while the body shows.
 */
export function drawsOverflow({
  scroll,
  device,
}: Pick<FrameRecord, 'scroll' | 'device'>): boolean {
  return !scroll && device === undefined
}

/** How many of a frame's elements past its edge the board paints, each being one render on the server's serial queue. */
const PAINTED_MAX = 20

/** The elements past a frame's edge the board paints, the first in document order. */
export function paintedIndexes(
  ghosts: readonly { index: number }[],
): ReadonlySet<number> {
  return new Set(ghosts.slice(0, PAINTED_MAX).map(({ index }) => index))
}

/**
 * The element's picture, addressed by its bytes. `at` is for the browser
 * alone, asking again where the pixels move with no write to the file, as a
 * token write and a resize do.
 */
export function pictureUrl(
  { frame, index, hash }: ElementKey,
  { width, height }: Box,
  theme: Theme,
  version: number,
): string {
  const query = new URLSearchParams({
    ref: frame,
    theme,
    element: String(index),
    hash,
    scale: '2',
    at: `${version}-${width}x${height}`,
  })
  return `/api/frames/png?${query}`
}
