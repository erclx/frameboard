import { z } from 'zod'

const themeSchema = z.enum(['light', 'dark'])

/** What `capture` returns: every PNG it wrote, one per frame and theme, or one per theme for a composite. */
export const captureResultSchema = z.object({
  images: z.array(
    z.object({
      ref: z.string(),
      theme: themeSchema,
      path: z.string(),
      width: z.int().min(1),
      height: z.int().min(1),
    }),
  ),
})

export type CaptureResult = z.infer<typeof captureResultSchema>
