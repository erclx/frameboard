import type { z } from 'zod'

import { addressFileSchema } from './address'
import { boardFileSchema, layoutFileSchema, projectFileSchema } from './board'
import { editResultSchema } from './edit'
import {
  frameRecordSchema,
  listResultSchema,
  pageRecordSchema,
  projectRecordSchema,
} from './list'

/** Every record by name, the one place a later row registers a record for `docs`. */
export const RECORDS: Record<string, z.ZodType> = {
  board: boardFileSchema,
  project: projectFileSchema,
  layout: layoutFileSchema,
  address: addressFileSchema,
  frame: frameRecordSchema,
  page: pageRecordSchema,
  projectRecord: projectRecordSchema,
  list: listResultSchema,
  edit: editResultSchema,
}
