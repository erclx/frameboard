import { z } from 'zod'

import type { Motion } from '@/shared/motion'

/** A live frame's timeline and the length in ms its track spans. */
export interface FrameMotion {
  motion: Motion
  /**
   * The timeline's end, or for one that repeats forever its longest single
   * iteration, so a spinner still scrubs within one turn.
   */
  span: number
}

export const frameMotionSchema: z.ZodType<FrameMotion> = z.object({
  motion: z.object({
    source: z.enum(['hf', 'timelines', 'css', 'model']),
    duration: z.number().finite().nonnegative().nullable(),
  }),
  span: z.number().finite().nonnegative(),
})
