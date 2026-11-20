import { join } from 'node:path'

import { FRAME_SIZES } from '@/shared/frame-sizes'

import { layOne } from '../drive-seed.ts'

/** The page holding one desktop frame that also shows at 834, so the widths row has a chip to read and a plus to open. */
const WIDTHS = { project: 'webapp', page: 'widths', frame: 'panel' }

const TILT_PAGE = join(import.meta.dirname, '../drive-tilt.html')

export function lay(root: string): Promise<'laid' | 'kept'> {
  return layOne(root, WIDTHS, TILT_PAGE, {
    ...FRAME_SIZES.desktop,
    widths: [{ width: 834, height: 1194 }],
  })
}
