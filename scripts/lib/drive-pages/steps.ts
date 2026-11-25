import { copyFile } from 'node:fs/promises'
import { join } from 'node:path'

import { ensureViewer } from '@/server/models/viewer'
import { ASSETS_FOLDER } from '@/shared/board-files'

import { layOne } from '../drive-seed.ts'

/**
 * One slide of eight steps in four presses, with a long entrance, a delayed
 * one, and a model and a video that each play as they appear, so the steps
 * list has rows to reorder and presenting has clips to start.
 */
const STEPS = { project: 'webapp', page: 'steps', frame: 'build' }

const STEPS_PAGE = join(import.meta.dirname, '../drive-steps.html')

const FIXTURES = join(import.meta.dirname, '../../../test/fixtures')

/** The animated test model, which carries one clip named Spin, and the test video. */
const CLIPS = { 'spin.glb': 'models', 'clip.webm': 'media' }

/** Lays the slide with its clips and the viewer script in webapp's assets. */
export async function lay(root: string): Promise<'laid' | 'kept'> {
  const laid = await layOne(root, STEPS, STEPS_PAGE, {
    width: 1280,
    height: 720,
  })
  if (laid === 'kept') return laid
  const project = join(root, STEPS.project)
  await ensureViewer(project)
  await Promise.all(
    Object.entries(CLIPS).map(([file, folder]) =>
      copyFile(
        join(FIXTURES, folder, file),
        join(project, ASSETS_FOLDER, file),
      ),
    ),
  )
  return laid
}
