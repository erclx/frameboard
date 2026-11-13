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
  /** Each element's index in the file as written, in the order a batch sent them, with `index` the last. */
  indexes: z.array(z.int().min(0)).optional(),
})

export type EditResult = z.infer<typeof editResultSchema>

/** What `POST /api/frames/insert` returns: the frame it wrote, the new element, and the hash the next write is made from. */
export const insertResultSchema = z.object({
  ref: z.string(),
  index: z.int().min(0),
  hash,
})

export type InsertResult = z.infer<typeof insertResultSchema>

/** What `remove` and `POST /api/frames/remove` return: the frame it wrote and the hash the next write is made from. */
export const removeResultSchema = z.object({
  ref: z.string(),
  hash,
})

export type RemoveResult = z.infer<typeof removeResultSchema>

/** What `POST /api/frames/move` returns: the frame it wrote, the moved element's new index, and the hash the next write is made from. */
export const moveResultSchema = z.object({
  ref: z.string(),
  index: z.int().min(0),
  hash,
})

export type MoveResult = z.infer<typeof moveResultSchema>

/** A size a placement wrote where no rule set one. */
export const placedSizeSchema = z.enum(['width', 'height'])

/** What `POST /api/frames/place` returns: the frame it wrote, the placed element's index, the hash the next write is made from, and the sizes a placement wrote. */
export const placeResultSchema = z.object({
  ref: z.string(),
  index: z.int().min(0),
  hash,
  sized: z.array(placedSizeSchema),
  /** Each element a batch placed and the sizes written on it, in the order sent, with `index` and `sized` the last's. */
  placed: z
    .array(
      z.object({ index: z.int().min(0), sized: z.array(placedSizeSchema) }),
    )
    .optional(),
})

export type PlaceResult = z.infer<typeof placeResultSchema>

/** What `POST /api/frames/wrap` returns: the frame it wrote, the new container's index, each member's index in the order sent, and the hash the next write is made from. */
export const wrapResultSchema = z.object({
  ref: z.string(),
  index: z.int().min(0),
  members: z.array(z.int().min(0)),
  hash,
})

export type WrapResult = z.infer<typeof wrapResultSchema>

/** What `POST /api/frames/recolor` returns: the frame, the hash the next write is made from, and how many elements the replace rewrote. */
export const recolorResultSchema = z.object({
  ref: z.string(),
  hash,
  count: z.int().min(0),
})

export type RecolorResult = z.infer<typeof recolorResultSchema>
