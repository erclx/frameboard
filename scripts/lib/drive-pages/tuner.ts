import { join } from 'node:path'

import { layOne } from '../drive-seed.ts'

/**
 * The page holding one frame of a photo and three sliders bound to it, so a
 * reel draws the links in Edit, tunes and keeps the values in Play, and
 * exports the photo alone.
 */
const TUNER = { project: 'webapp', page: 'tuner', frame: 'photo-tuner' }

const TUNER_PAGE = join(import.meta.dirname, '../drive-tuner.html')

export function lay(root: string): Promise<'laid' | 'kept'> {
  return layOne(root, TUNER, TUNER_PAGE, { width: 640, height: 280 })
}
