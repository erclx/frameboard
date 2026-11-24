import type { FrameRecord } from '@/shared/records/list'
import type { Theme } from '@/shared/theme'

import type { Box } from '../geometry/box'
import type { ElementKey } from '../selection'

/**
 * Whether anything draws past a frame's edge. A scroll frame reaches its
 * overflow by scrolling, and a frame showing its device body is one screen of
 * a page that scrolls, as Present and Play scroll it. A record carries
 * `device` only while the body shows.
 */
export function drawsOverflow({
  scroll,
  device,
}: Pick<FrameRecord, 'scroll' | 'device'>): boolean {
  return !scroll && device === undefined
}

/** How many of a frame's elements past its edge the board paints, each being one render on the server's serial queue. */
export const PAINTED_MAX = 20

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
