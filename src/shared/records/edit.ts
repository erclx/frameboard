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

/** What `POST /api/frames/insert` returns: the frame it wrote, the new element, and the hash the next write is made from. */
export const insertResultSchema = z.object({
  ref: z.string(),
  index: z.int().min(0),
  hash,
})

export type InsertResult = z.infer<typeof insertResultSchema>

/** What `POST /api/frames/remove` returns: the frame it wrote and the hash the next write is made from. */
export const removeResultSchema = z.object({
  ref: z.string(),
  hash,
})

export type RemoveResult = z.infer<typeof removeResultSchema>
