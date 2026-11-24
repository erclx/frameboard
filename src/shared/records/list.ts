import { z } from 'zod'

import { DEVICES, POSES } from '../frame-device'
import { DIRECTIONS } from '../present-transition'

const recordErrorSchema = z
  .object({ path: z.string(), message: z.string() })
  .nullable()

/** A transition as present mode reads it, `direction` and `ms` absent at their default. */
export const transitionRecordSchema = z.object({
  /** A built-in name or one of the project's `transitions`. */
  name: z.string(),
  direction: z.enum(DIRECTIONS).optional(),
  ms: z.int().optional(),
})

export const frameRecordSchema = z.object({
  ref: z.string(),
  project: z.string(),
  page: z.string(),
  name: z.string(),
  path: z.string(),
  box: z.object({
    x: z.number(),
    y: z.number(),
    width: z.number(),
    height: z.number(),
  }),
  order: z.number(),
  hidden: z.boolean(),
  locked: z.boolean(),
  /** Whether each axis takes its size from the content rather than holding it. */
  hugWidth: z.boolean(),
  hugHeight: z.boolean(),
  /** Whether the frame holds a fixed screen height and scrolls past it, fixing both axes. */
  scroll: z.boolean(),
  /** The extra widths the frame also shows at, beside it in a row, none when it lists none. */
  widths: z.array(z.object({ width: z.number(), height: z.number() })),
  /** Whether the board draws the frame inside a device, absent when it does not. */
  showDevice: z.boolean().optional(),
  /**
   * The device the frame draws inside while it shows one: `foldable` when the
   * frame names it, else the one its width picks, absent when off or under 320 wide.
   */
  device: z.enum(DEVICES).optional(),
  /** The pose a frame naming the foldable is folded to, shown or not, absent on every other frame. */
  pose: z.enum(POSES).optional(),
  /** `wide` while the frame picks the phone's wide island, shown or not, absent for the compact one. */
  island: z.literal('wide').optional(),
  /**
   * The way a phone, tablet, or foldable frame is turned, shown or not, absent upright.
   * A turned frame's box is landscape, and a turned phone draws no status bar.
   */
  turn: z.enum(['left', 'right']).optional(),
  /** Whether the board paints the frame's content past its edge, absent while it clips. A capture or an export clips either way. */
  showOverflow: z.literal(true).optional(),
  /** The transition the frame arrives with in present mode, over its page's, absent when it holds none. */
  transition: transitionRecordSchema.optional(),
  /** What the presenter means to say over the slide, plain text with its line breaks, absent when it holds none. */
  speakerNotes: z.string().optional(),
  /** The project kit the frame names, absent when it names none, and still given where the project holds no such kit. */
  kit: z.string().optional(),
  placed: z.boolean(),
  modifiedAt: z.string(),
})

export type FrameRecord = z.infer<typeof frameRecordSchema>

export const sectionRecordSchema = z.object({
  name: z.string(),
  box: z.object({
    x: z.number(),
    y: z.number(),
    width: z.number(),
    height: z.number(),
  }),
  order: z.number(),
  /** The frames whose center the section holds, bottom of the stack first. */
  frames: z.array(z.string()),
})

export type SectionRecord = z.infer<typeof sectionRecordSchema>

export const pageRecordSchema = z.object({
  ref: z.string(),
  project: z.string(),
  name: z.string(),
  path: z.string(),
  index: z.number(),
  layoutError: recordErrorSchema,
  /** The transition present mode draws between the page's slides, absent when it holds none. */
  transition: transitionRecordSchema.optional(),
  frames: z.array(frameRecordSchema),
  /** Bottom first, as frames are. */
  sections: z.array(sectionRecordSchema),
})

export type PageRecord = z.infer<typeof pageRecordSchema>

/** One kit a project added, a folder under its `assets/kits/`. */
export const projectKitRecordSchema = z.object({
  /** The kit's folder, which a frame's `kit` and `frame kit` name it by. */
  name: z.string(),
  /** The name a person reads, the folder's where its `kit.json` gives none. */
  title: z.string(),
  /** How many of the project's frames name the kit. */
  frameCount: z.number(),
})

export type ProjectKitRecord = z.infer<typeof projectKitRecordSchema>

export const projectRecordSchema = z.object({
  /** The folder, which every ref, URL, and CLI argument names the project by. */
  name: z.string(),
  /** The name a person reads, null when `project.json` holds none, where readers show `name`. */
  title: z.string().nullable(),
  path: z.string(),
  modifiedAt: z.string(),
  /** When the project was made, null for one made before the time was recorded. */
  createdAt: z.string().nullable(),
  /** The folder home files the project under, null for one in no folder. */
  group: z.string().nullable(),
  /** Whether home holds the project out of the main list, in its Archived section. */
  archived: z.boolean(),
  projectFileError: recordErrorSchema,
  /** The project's own transitions by name, sorted, empty when it holds none. */
  transitions: z.array(z.string()),
  /** The rule ids `checks.off` in `project.json` turns off, in the file's order and each once, empty when it holds none. */
  checksOff: z.array(z.string()),
  /** The kits the project added, by name, empty when it holds none. */
  kits: z.array(projectKitRecordSchema),
  pages: z.array(pageRecordSchema),
})

export type ProjectRecord = z.infer<typeof projectRecordSchema>

export const listResultSchema = z.object({
  root: z.string(),
  projects: z.array(projectRecordSchema),
})

export type ListResult = z.infer<typeof listResultSchema>
