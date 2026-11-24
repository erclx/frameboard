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
  /** The lowest text contrast ratio the `min-contrast` rule allows, 4.5 being WCAG's. */
  minContrast: z.number().min(1).optional(),
  /** The ids of the rules the project turns off, on the board, in `check`, and in the hook. */
  off: z.array(z.string()).optional(),
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
  // The folder home files the project under, one level deep, and whether it
  // sits in the Archived section. A value of another type parses as written
  // and reads as ungrouped or unarchived, as createdAt does.
  group: z.union([z.string(), z.unknown()]).optional(),
  archived: z.union([z.boolean(), z.unknown()]).optional(),
  // The name home and the board show for the project, which may hold any
  // characters while the folder keeps a valid name. A value of another type
  // parses as written and reads as no title, as group does.
  title: z.union([z.string(), z.unknown()]).optional(),
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
  // A scroll frame holds its box on both axes and scrolls past it, so readers
  // take either hug flag beside it as false.
  scroll: z.boolean().optional(),
  // The extra widths the frame also shows at, each beside it on the board,
  // with the height its view holds there. A value of another shape parses as
  // written and reads as none, as a project's group does.
  widths: z
    .union([
      z.array(z.looseObject({ width: z.int().min(1), height: z.int().min(1) })),
      z.unknown(),
    ])
    .optional(),
  // Whether the board draws the frame inside the device its width names.
  // Only true shows it, and a value of another kind parses as written.
  showDevice: z.unknown().optional(),
  // The key before showDevice, naming a device. Any string reads as shown,
  // and the next write of the entry replaces it with showDevice.
  device: z.unknown().optional(),
  // Whether the frame names the foldable over the device its width picks,
  // and the pose it is folded to. Only true names it, a pose no reader knows
  // reads as closed, and either value of another kind parses as written.
  foldable: z.unknown().optional(),
  pose: z.unknown().optional(),
  // The phone's island width, `wide` alone, absent for the compact one. A
  // value no reader knows parses as written and reads as compact.
  island: z.unknown().optional(),
  // Whether the board paints the frame's content past its edge. Only true
  // shows it, and a value of another kind parses as written.
  showOverflow: z.unknown().optional(),
  // A quarter turn, `left` or `right`, and the upright size it restores, which
  // a foldable's pose gives instead. Another device's turn with no readable
  // upright, or a value no reader knows, reads as upright.
  turn: z.unknown().optional(),
  upright: z.unknown().optional(),
  // The transition the frame arrives with in present mode, over its page's.
  // A value no reader knows parses as written and reads as none.
  transition: z.unknown().optional(),
  // What the presenter means to say over the slide, kept here rather than in
  // the frame's file so an agent rewriting the design never drops it. A value
  // of another type parses as written and reads as no note.
  speakerNotes: z.unknown().optional(),
  // The project kit the frame draws with, a folder under the project's
  // `assets/kits/`, kept here so a rewrite of the frame's file never drops
  // it. A value that names no kit parses as written and reads as none.
  kit: z.unknown().optional(),
})

export type LayoutEntry = z.infer<typeof layoutEntrySchema>

/** The longest speaker note a write accepts, in characters. */
export const SPEAKER_NOTES_MAX = 10_000

/** The note a layout entry's `speakerNotes` holds, null for none or a value of another type. */
export function speakerNotesOf(value: unknown): string | null {
  return typeof value === 'string' && value.trim() !== '' ? value : null
}

/** A named box grouping the frames whose center it holds, which it never lists. */
export const sectionEntrySchema = z.looseObject({
  x: z.int(),
  y: z.int(),
  width: z.int().min(1),
  height: z.int().min(1),
  order: z.int().min(0),
})

export type SectionEntry = z.infer<typeof sectionEntrySchema>

export const layoutFileSchema = z.looseObject({
  version: z.literal(1),
  frames: z.record(z.string(), layoutEntrySchema),
  // Optional, so a layout from before sections reads and writes as it was.
  sections: z.record(z.string(), sectionEntrySchema).optional(),
  // What present mode draws for the page, being its slide transition. A
  // value no reader knows parses as written and reads as none.
  present: z.unknown().optional(),
})

export type LayoutFile = z.infer<typeof layoutFileSchema>
