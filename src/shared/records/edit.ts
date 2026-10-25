import { z } from 'zod'

const hash = z.string().regex(/^[0-9a-f]{64}$/)

/** What `edit` returns: the frame it wrote, the element, and the hash the next edit is made from. */
export const editResultSchema = z.object({
  ref: z.string(),
  /** The element's index in the file as written, which moves once the edit was found again by its bytes. */
  index: z.int().min(0),
  hash,
  /** The hash the edit was written over, which differs from the one sent once the edit was found again. */
  from: hash.optional(),
})

export type EditResult = z.infer<typeof editResultSchema>
