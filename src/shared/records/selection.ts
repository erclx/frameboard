import { z } from 'zod'

const hashSchema = z.string().regex(/^[0-9a-f]{64}$/)

/** More frames than any page holds, so a report cannot grow without bound. */
const MAX_FRAMES = 1000

const refSchema = z.string().min(1).max(1024)

/** What a writing board tab posts to `/api/selection` each time its selection changes. */
export const selectionReportSchema = z.object({
  /** The id the tab said hello with, so its socket closing forgets the report. */
  tab: z.string().min(1).max(128),
  /** The page ref, `<project>/<page>`, null with nothing selected. */
  page: refSchema.nullable(),
  frames: z.array(refSchema).max(MAX_FRAMES),
  element: z
    .object({ ref: refSchema, index: z.int().min(0), hash: hashSchema })
    .nullable(),
})

export type SelectionReport = z.infer<typeof selectionReportSchema>

/** The selected element, in the address `edit --index --hash` takes. */
export const selectedElementSchema = z.object({
  /** The frame ref, `<project>/<page>/<frame>`. */
  ref: z.string(),
  index: z.int().min(0),
  hash: hashSchema,
  tag: z.string(),
  /** Named as the layers rows name it. */
  name: z.string(),
})

export type SelectedElement = z.infer<typeof selectedElementSchema>

/** What `selection` returns: what the writing tab last reported selecting, and how many writing tabs are open. */
export const selectionResultSchema = z.object({
  project: z.string().nullable(),
  page: z.string().nullable(),
  /** Frame refs, `<project>/<page>/<frame>`, empty with nothing selected. */
  frames: z.array(z.string()),
  /** Null with no element selected, or once the frame changed past the hash the tab reported. */
  element: selectedElementSchema.nullable(),
  /** The writing board tabs connected, zero when none is open to select anything. */
  tabs: z.int().min(0),
})

export type SelectionResult = z.infer<typeof selectionResultSchema>
