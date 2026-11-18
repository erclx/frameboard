import { z } from 'zod'

/** A selected `<video>` or `<audio>` as its frame's live page plays it. */
export interface MediaReading {
  tag: 'video' | 'audio'
  /** False once the browser cannot decode the file, or a video decodes no picture. */
  playable: boolean
  paused: boolean
  /** The position in seconds. */
  time: number
  /** The length in seconds, `NaN` until the metadata loads. */
  length: number
  /** Whether the live page is silent now, which a listen flips and nothing writes. */
  muted: boolean
  /** Whether the file states `muted`, which only a written edit changes. */
  mutedInFile: boolean
  /** Whether the file states `controls`, so the page draws the browser's own strip. */
  controls: boolean
  /** Whether the file states `autoplay`, which a browser honors only beside `muted`. */
  autoplay: boolean
  /** Whether the file states `loop`. */
  loop: boolean
}

/** What the board asks of a live media element, each moving the page alone and writing nothing. */
export type MediaAct =
  | { kind: 'toggle-play' }
  | { kind: 'seek'; seconds: number }
  | { kind: 'toggle-sound' }

export const mediaActSchema: z.ZodType<MediaAct> = z.union([
  z.object({ kind: z.literal('toggle-play') }),
  z.object({ kind: z.literal('seek'), seconds: z.number().finite() }),
  z.object({ kind: z.literal('toggle-sound') }),
])

export const mediaReadingSchema: z.ZodType<MediaReading | null> = z
  .object({
    tag: z.enum(['video', 'audio']),
    playable: z.boolean(),
    paused: z.boolean(),
    time: z.number().finite(),
    // `NaN` before the metadata and `Infinity` for a stream, both of which a posted message carries.
    length: z.custom<number>((value) => typeof value === 'number'),
    muted: z.boolean(),
    mutedInFile: z.boolean(),
    controls: z.boolean(),
    autoplay: z.boolean(),
    loop: z.boolean(),
  })
  .nullable()
