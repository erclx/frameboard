import { existsSync } from 'node:fs'
import { copyFile, mkdir, writeFile } from 'node:fs/promises'
import { join } from 'node:path'

import { FRAME_SIZES } from '@/shared/frame-sizes'

import { listPage, relistKept } from '../drive-seed.ts'

/**
 * The page holding a phone with a tablet and a laptop width linked past it,
 * over a laptop and a tablet upright and turned, so one drive reads each body.
 */
const BODIES = { project: 'webapp', page: 'bodies' }

const { phone, tablet, desktop } = FRAME_SIZES
const SHOWN = { showDevice: true, hidden: false, locked: false }
const ROW = 1400

const FRAMES = {
  phone: { x: 0, y: 0, ...phone, widths: [tablet, desktop] },
  laptop: { x: 0, y: ROW, ...desktop },
  tablet: { x: 1720, y: ROW, ...tablet },
  turned: {
    x: 2720,
    y: ROW,
    width: tablet.height,
    height: tablet.width,
    turn: 'left',
    upright: tablet,
  },
}

/** A page that goes from one column to two past 700 px, so each width shows its own layout. */
const BODIES_PAGE = join(import.meta.dirname, '../drive-fold.html')

export async function lay(root: string): Promise<'laid' | 'kept'> {
  const { project, page } = BODIES
  const folder = join(root, project, page)
  if (existsSync(folder)) {
    await relistKept(root, project, page)
    return 'kept'
  }
  await mkdir(folder)

  const placed = Object.entries(FRAMES).map(
    ([name, frame], order) => [name, { ...frame, ...SHOWN, order }] as const,
  )
  await Promise.all([
    ...placed.map(([name]) =>
      copyFile(BODIES_PAGE, join(folder, `${name}.html`)),
    ),
    writeFile(
      join(folder, 'layout.json'),
      `${JSON.stringify({ version: 1, frames: Object.fromEntries(placed) }, null, 2)}\n`,
    ),
  ])
  await listPage(root, project, page)
  return 'laid'
}
