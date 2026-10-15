import { z } from 'zod'

/** What `edit` returns: the frame it wrote, the element, and the hash the next edit is made from. */
export const editResultSchema = z.object({
  ref: z.string(),
  index: z.int().min(0),
  hash: z.string().regex(/^[0-9a-f]{64}$/),
})

export type EditResult = z.infer<typeof editResultSchema>
