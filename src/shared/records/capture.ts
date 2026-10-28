import { z } from 'zod'

import { frameRecordSchema } from './list'

const themeSchema = z.enum(['light', 'dark'])

/** What `capture` returns: every PNG it wrote, one per frame and theme, or one per theme for a composite. */
export const captureResultSchema = z.object({
  images: z.array(
    z.object({
      ref: z.string(),
      theme: themeSchema,
      path: z.string(),
      /** The layout box in CSS pixels, whatever the scale. */
      width: z.int().min(1),
      height: z.int().min(1),
      /** Device pixels per CSS pixel, so the file is `width * scale` wide. */
      scale: z.int().min(1).max(3),
    }),
  ),
})

export type CaptureResult = z.infer<typeof captureResultSchema>

/** What `frame fit` returns: the frame as resized, the height it measured, and its width against the layout's. */
export const fitResultSchema = z.object({
  frame: frameRecordSchema,
  contentHeight: z.int().min(1),
  contentWidth: z.int().min(0),
  tooWide: z.boolean(),
})

export type FitResult = z.infer<typeof fitResultSchema>
