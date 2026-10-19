import { z } from 'zod'

/** One element under a frame's `body`, addressed by the index `edit --index` takes. */
export const treeElementSchema = z.object({
  index: z.int().min(0),
  /** The index of the element it sits in, null for a child of `body`. */
  parent: z.int().min(0).nullable(),
  tag: z.string(),
  /** `data-name`, else a text-only element's text cut to 40 characters, else an `img`'s `alt`, else the tag. */
  name: z.string(),
  /** True when the element holds text and nothing else. */
  textOnly: z.boolean(),
})

export type TreeElement = z.infer<typeof treeElementSchema>

/** What `GET /api/frames/elements` answers: a frame's elements under `body` in index order, and the hash they were read from. */
export const elementTreeSchema = z.object({
  ref: z.string(),
  hash: z.string().regex(/^[0-9a-f]{64}$/),
  elements: z.array(treeElementSchema),
})

export type ElementTree = z.infer<typeof elementTreeSchema>
