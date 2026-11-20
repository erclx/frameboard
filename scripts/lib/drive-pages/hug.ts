import { join } from 'node:path'

import { layOne } from '../drive-seed.ts'

/** The page holding one frame that hugs its width, so the widths row reads its plus disabled. */
const HUG = { project: 'webapp', page: 'hug', frame: 'badge' }

const TILT_PAGE = join(import.meta.dirname, '../drive-tilt.html')

export function lay(root: string): Promise<'laid' | 'kept'> {
  return layOne(root, HUG, TILT_PAGE, {
    width: 320,
    height: 200,
    hugWidth: true,
  })
}
