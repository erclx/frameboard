import { copyFile } from 'node:fs/promises'
import { join } from 'node:path'

import { ensureViewer } from '@/server/models/viewer'
import { ASSETS_FOLDER } from '@/shared/board-files'

import { layOne } from '../drive-seed.ts'

/**
 * The page holding one model with a clip it never plays, so the Model section
 * has an angle, a rotation, a scale, and a clip to stage, and a double-click a
 * model to turn.
 */
const MODEL = { project: 'webapp', page: 'model', frame: 'spin' }

const MODEL_PAGE = join(import.meta.dirname, '../drive-model.html')

/** The animated test model, which carries one clip named Spin. */
const MODEL_FILE = join(
  import.meta.dirname,
  '../../../test/fixtures/models/spin.glb',
)

/**
 * Lays the model page with its model and the viewer script in webapp's assets,
 * as placing a model on the board leaves them.
 */
export async function lay(root: string): Promise<'laid' | 'kept'> {
  const laid = await layOne(root, MODEL, MODEL_PAGE, {
    width: 640,
    height: 480,
  })
  if (laid === 'kept') return laid
  const project = join(root, MODEL.project)
  await ensureViewer(project)
  await copyFile(MODEL_FILE, join(project, ASSETS_FOLDER, 'spin.glb'))
  return laid
}
