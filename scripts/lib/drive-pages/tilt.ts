import { join } from 'node:path'

import { layOne } from '../drive-seed.ts'

/** The page holding one card its own transform tilts, so a reel shows the 3D section filled and the Rotation row off. */
const TILT = { project: 'webapp', page: 'tilt', frame: 'card' }

const TILT_PAGE = join(import.meta.dirname, '../drive-tilt.html')

export function lay(root: string): Promise<'laid' | 'kept'> {
  return layOne(root, TILT, TILT_PAGE)
}
