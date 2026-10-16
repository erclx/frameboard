import { z } from 'zod'

// Every record reads through looseObject, so a newer Frameboard's keys survive
// an older writer.

export const boardFileSchema = z.looseObject({ version: z.literal(1) })

export type BoardFile = z.infer<typeof boardFileSchema>

/** A project's own check rules, absent meaning the built-in rules alone. */
export const projectChecksSchema = z.looseObject({
  allowedFonts: z.array(z.string()).optional(),
  noUppercase: z.boolean().optional(),
})

export type ProjectChecks = z.infer<typeof projectChecksSchema>

export const projectFileSchema = z.looseObject({
  version: z.literal(1),
  pages: z.array(z.string()),
  checks: projectChecksSchema.optional(),
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
})

export type LayoutEntry = z.infer<typeof layoutEntrySchema>

export const layoutFileSchema = z.looseObject({
  version: z.literal(1),
  frames: z.record(z.string(), layoutEntrySchema),
})

export type LayoutFile = z.infer<typeof layoutFileSchema>
