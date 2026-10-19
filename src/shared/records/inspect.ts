import { z } from 'zod'

const themeSchema = z.enum(['light', 'dark'])

/** One rendered element, addressed by the index `edit --index` takes. */
export const inspectedElementSchema = z.object({
  index: z.int().min(0),
  tag: z.string(),
  id: z.string().nullable(),
  classes: z.array(z.string()),
  /** The element's own text, trimmed and cut to 80 characters. */
  text: z.string(),
  /** In document coordinates, so an element below the fold keeps its y. */
  box: z.object({
    x: z.number(),
    y: z.number(),
    width: z.number(),
    height: z.number(),
  }),
  /** Computed values exactly as `getComputedStyle` prints them. */
  color: z.string(),
  backgroundColor: z.string(),
  fontFamily: z.string(),
  fontSize: z.string(),
  fontWeight: z.string(),
  lineHeight: z.string(),
})

export type InspectedElement = z.infer<typeof inspectedElementSchema>

/** What `inspect` returns: the rendered elements of a frame in one theme, and the file hash `edit --hash` takes. */
export const inspectResultSchema = z.object({
  ref: z.string(),
  theme: themeSchema,
  hash: z.string().regex(/^[0-9a-f]{64}$/),
  /** False when the browser builds an element the file does not state, where `edit` refuses every index. */
  editable: z.boolean(),
  elements: z.array(inspectedElementSchema),
})

export type InspectResult = z.infer<typeof inspectResultSchema>
