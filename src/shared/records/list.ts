import { z } from 'zod'

const recordErrorSchema = z
  .object({ path: z.string(), message: z.string() })
  .nullable()

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
  placed: z.boolean(),
  modifiedAt: z.string(),
})

export type FrameRecord = z.infer<typeof frameRecordSchema>

export const pageRecordSchema = z.object({
  ref: z.string(),
  project: z.string(),
  name: z.string(),
  path: z.string(),
  index: z.number(),
  layoutError: recordErrorSchema,
  frames: z.array(frameRecordSchema),
})

export type PageRecord = z.infer<typeof pageRecordSchema>

export const projectRecordSchema = z.object({
  name: z.string(),
  path: z.string(),
  modifiedAt: z.string(),
  projectFileError: recordErrorSchema,
  pages: z.array(pageRecordSchema),
})

export type ProjectRecord = z.infer<typeof projectRecordSchema>

export const listResultSchema = z.object({
  root: z.string(),
  projects: z.array(projectRecordSchema),
})

export type ListResult = z.infer<typeof listResultSchema>
