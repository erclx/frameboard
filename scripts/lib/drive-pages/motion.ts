import { join } from 'node:path'

import { layOne } from '../drive-seed.ts'

/**
 * The page holding one frame whose box slides across over four seconds, so
 * the Motion section, its track, and the Held chip have a timeline to drive.
 */
const MOTION = { project: 'marketing', page: 'motion', frame: 'slide' }

/** A box sliding 1000 px right over four seconds and holding there, in the board's tokens. */
const SLIDE_PAGE = join(import.meta.dirname, '../drive-slide.html')

export function lay(root: string): Promise<'laid' | 'kept'> {
  return layOne(root, MOTION, SLIDE_PAGE)
}
