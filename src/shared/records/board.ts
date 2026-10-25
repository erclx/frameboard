import { z } from 'zod'

// Every record reads through looseObject, so a newer Frameboard's keys survive
// an older writer.

export const boardFileSchema = z.looseObject({ version: z.literal(1) })

export type BoardFile = z.infer<typeof boardFileSchema>

/** A project's own check rules, absent meaning the built-in rules alone. */
export const projectChecksSchema = z.looseObject({
  allowedFonts: z.array(z.string()).optional(),
  noUppercase: z.boolean().optional(),
  /** The smallest text size in pixels the `min-font-size` rule allows. */
  minFontSize: z.number().positive().optional(),
})

export type ProjectChecks = z.infer<typeof projectChecksSchema>

export const projectFileSchema = z.looseObject({
  version: z.literal(1),
  pages: z.array(z.string()),
  // Written once when the project is made, and absent on one made before it
  // was recorded. A value that is not a time parses too, as checks does, and
  // reads as no time.
  createdAt: z.union([z.iso.datetime(), z.unknown()]).optional(),
  // A checks value the rules cannot read still parses as written, so a page
  // verb keeps the file and its page order, and the check reads that rule as
  // off, the way it reads a missing key.
  checks: z.union([projectChecksSchema, z.unknown()]).optional(),
})

export type ProjectFile = z.infer<typeof projectFileSchema>

export const layoutEntrySchema = z.looseObject({
  x: z.int(),
  y: z.int(),
  width: z.int().min(1),
  height: z.int().min(1),
  order: z.int().min(0),
  // Optional rather than defaulted, so a read never adds keys to an entry the
  // write leaves alone. Readers take absent as false.
  hidden: z.boolean().optional(),
  locked: z.boolean().optional(),
  // An axis that hugs takes its size from the frame's content, which the
  // running server measures and writes, and absent reads as fixed.
  hugWidth: z.boolean().optional(),
  hugHeight: z.boolean().optional(),
})

export type LayoutEntry = z.infer<typeof layoutEntrySchema>

export const layoutFileSchema = z.looseObject({
  version: z.literal(1),
  frames: z.record(z.string(), layoutEntrySchema),
})

export type LayoutFile = z.infer<typeof layoutFileSchema>
