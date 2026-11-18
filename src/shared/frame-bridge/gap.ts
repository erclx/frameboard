import { z } from 'zod'

import type { FramePoint } from './messages'

/** The line the drop line draws at a gap, in frame pixels, zero thick across its axis. */
export interface GapLine {
  x: number
  y: number
  width: number
  height: number
}

/** Where a placed element lands, as the insert route's file indices, and where the line draws. */
export interface Gap {
  parent: number
  /** The child it goes before, or null for the container's end. */
  before: number | null
  /** Whether the container lays its children out along x, where a divider draws vertical. */
  row: boolean
  /** Whether the container lays its children out as flex or grid, where a placed element joins that flow. */
  flow: boolean
  /**
   * Where a free element's `left` and `top` count from, the container's padding
   * box unless it is `body`, else the nearest positioned ancestor or the origin.
   */
  origin: FramePoint
  /** The container's content width in frame pixels, which a placed file is capped at. */
  room: number
  line: GapLine
}

/** The gap under a frame point, with the hash of the bytes it was read from. */
export interface ShownGap {
  hash: string
  gap: Gap
}

const finite = z.number().finite()

const index = z.number().int().nonnegative()

export const shownGapSchema: z.ZodType<ShownGap | null> = z
  .object({
    hash: z.string(),
    gap: z.object({
      parent: index,
      before: index.nullable(),
      row: z.boolean(),
      flow: z.boolean(),
      origin: z.object({ x: finite, y: finite }),
      room: finite,
      line: z.object({ x: finite, y: finite, width: finite, height: finite }),
    }),
  })
  .nullable()
