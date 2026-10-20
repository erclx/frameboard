import { z } from 'zod'

/** One match: a frame by its name, an element by its name, or an element's own text. */
export const findHitSchema = z.object({
  kind: z.enum(['frame', 'element', 'text']),
  page: z.string(),
  /** The frame's name. */
  frame: z.string(),
  /** The frame ref, `<project>/<page>/<frame>`. */
  ref: z.string(),
  /** The element's index as `edit --index` takes it, null for a frame hit. */
  index: z.int().min(0).nullable(),
  /** The hash of the file the index was read from, null for a frame hit. */
  hash: z
    .string()
    .regex(/^[0-9a-f]{64}$/)
    .nullable(),
  /** The frame's name for a frame hit, else the element's name by the layers rule. */
  name: z.string(),
  /** A text hit's own text around the match, null for any other hit. */
  snippet: z.string().nullable(),
})

export type FindHit = z.infer<typeof findHitSchema>

/** What `GET /api/find` answers, in page order, with `truncated` set once the hits were cut. */
export const findResultSchema = z.object({
  project: z.string(),
  query: z.string(),
  hits: z.array(findHitSchema),
  truncated: z.boolean(),
})

export type FindResult = z.infer<typeof findResultSchema>
