import type { z } from 'zod'

import { addressFileSchema } from './address'
import { assetAddResultSchema, assetListSchema } from './assets'
import { boardFileSchema, layoutFileSchema, projectFileSchema } from './board'
import { captureResultSchema, fitResultSchema } from './capture'
import { checkResultSchema } from './check'
import { editResultSchema } from './edit'
import { inspectResultSchema } from './inspect'
import {
  frameRecordSchema,
  listResultSchema,
  pageRecordSchema,
  projectRecordSchema,
} from './list'
import { listenerSchema, notesFileSchema } from './notes'
import { tokenTableSchema } from './tokens'

/** Every record by name, the one place a later row registers a record for `docs`. */
export const RECORDS: Record<string, z.core.$ZodType> = {
  board: boardFileSchema,
  project: projectFileSchema,
  layout: layoutFileSchema,
  address: addressFileSchema,
  frame: frameRecordSchema,
  page: pageRecordSchema,
  projectRecord: projectRecordSchema,
  list: listResultSchema,
  edit: editResultSchema,
  checkResult: checkResultSchema,
  capture: captureResultSchema,
  fit: fitResultSchema,
  inspect: inspectResultSchema,
  tokens: tokenTableSchema,
  notes: notesFileSchema,
  listener: listenerSchema,
  assetList: assetListSchema,
  assetAdd: assetAddResultSchema,
}
