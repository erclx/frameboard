import { z } from 'zod'

import { DEVICES } from '../frame-device'
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
  /** The device the board draws around the frame, absent when it has none. */
  device: z.enum(DEVICES).optional(),
  /** The transition the frame arrives with in present mode, over its page's, absent when it holds none. */
  transition: transitionRecordSchema.optional(),
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

export const projectRecordSchema = z.object({
  name: z.string(),
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
  pages: z.array(pageRecordSchema),
})

export type ProjectRecord = z.infer<typeof projectRecordSchema>

export const listResultSchema = z.object({
  root: z.string(),
  projects: z.array(projectRecordSchema),
})

export type ListResult = z.infer<typeof listResultSchema>
