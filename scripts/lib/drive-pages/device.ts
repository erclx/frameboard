import { join } from 'node:path'

import { FRAME_SIZES } from '@/shared/frame-sizes'

import { layOne } from '../drive-seed.ts'

/** One phone frame drawn inside its device, so the strip under a device body has a frame to select. */
const DEVICE = { project: 'webapp', page: 'device', frame: 'phone' }

/** The deck's first slide, which the phone shows. */
const DEVICE_PAGE = join(import.meta.dirname, '../drive-deck/01-intro.html')

export function lay(root: string): Promise<'laid' | 'kept'> {
  return layOne(root, DEVICE, DEVICE_PAGE, {
    ...FRAME_SIZES.phone,
    showDevice: true,
  })
}
