import type { z } from 'zod'

import { addressFileSchema } from './address'
import {
  assetAddResultSchema,
  assetFramesSchema,
  assetListSchema,
  assetRenameSchema,
  assetWriteResultSchema,
} from './assets'
import { boardFileSchema, layoutFileSchema, projectFileSchema } from './board'
import { captureResultSchema, fitResultSchema } from './capture'
import { checkResultSchema } from './check'
import { claimSchema } from './claims'
import { editResultSchema, removeResultSchema } from './edit'
import { elementTreeSchema } from './elements'
import { findResultSchema } from './find'
import { inspectResultSchema } from './inspect'
import {
  frameRecordSchema,
  listResultSchema,
  pageRecordSchema,
  projectRecordSchema,
} from './list'
import { listenerSchema, notesFileSchema } from './notes'
import { previewStartSchema, previewStopSchema } from './preview'
import { referencesCheckSchema, referencesSyncSchema } from './references'
import { selectionResultSchema } from './selection'
import {
  fontFindSchema,
  fontListSchema,
  fontRemoveSchema,
  imageDoctorSchema,
  imageFindSchema,
  imageGenerateSchema,
  licenseFileSchema,
  modelFindSchema,
  modelGenerateSchema,
  savedFontSchema,
  savedImageSchema,
  savedModelSchema,
} from './sourcing'
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
  remove: removeResultSchema,
  checkResult: checkResultSchema,
  capture: captureResultSchema,
  fit: fitResultSchema,
  inspect: inspectResultSchema,
  tokens: tokenTableSchema,
  notes: notesFileSchema,
  listener: listenerSchema,
  claim: claimSchema,
  assetList: assetListSchema,
  assetAdd: assetAddResultSchema,
  assetRename: assetRenameSchema,
  assetWrite: assetWriteResultSchema,
  assetFrames: assetFramesSchema,
  elements: elementTreeSchema,
  selection: selectionResultSchema,
  find: findResultSchema,
  referencesSync: referencesSyncSchema,
  referencesCheck: referencesCheckSchema,
  previewStart: previewStartSchema,
  previewStop: previewStopSchema,
  imageFind: imageFindSchema,
  savedImage: savedImageSchema,
  licenseFile: licenseFileSchema,
  imageGenerate: imageGenerateSchema,
  imageDoctor: imageDoctorSchema,
  modelFind: modelFindSchema,
  modelGenerate: modelGenerateSchema,
  savedModel: savedModelSchema,
  fontFind: fontFindSchema,
  savedFont: savedFontSchema,
  fontList: fontListSchema,
  fontRemove: fontRemoveSchema,
}
