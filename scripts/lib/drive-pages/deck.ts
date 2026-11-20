import { existsSync } from 'node:fs'
import { copyFile, mkdir, writeFile } from 'node:fs/promises'
import { join } from 'node:path'

import { FRAME_GAP } from '@/shared/frame-sizes'

import { listPage, relistKept } from '../drive-seed.ts'
import { WIPE } from './transition.ts'

/**
 * Three slides in a row under a Push transition, the middle one marking three
 * steps and holding a speaker note, so present mode has a transition and steps
 * to walk, and the inspector and the strip have a page, step, and note to read.
 */
const DECK = {
  project: 'webapp',
  page: 'deck',
  slides: ['01-intro', '02-build', '03-closing'],
  width: 1280,
  height: 720,
  /** The middle slide's note, two lines, so the strip shows a kept line break. */
  speakerNotes:
    'Walk the three steps in order and pause after each.\nEnd on the build finishing, then move on.',
}

const DECK_PAGES = join(import.meta.dirname, '../drive-deck')

export async function lay(root: string): Promise<'laid' | 'kept'> {
  const folder = join(root, DECK.project, DECK.page)
  if (existsSync(folder)) {
    await relistKept(root, DECK.project, DECK.page)
    return 'kept'
  }
  await mkdir(folder)

  const frames = Object.fromEntries(
    DECK.slides.map((name, index) => [
      name,
      {
        x: index * (DECK.width + FRAME_GAP),
        y: 0,
        width: DECK.width,
        height: DECK.height,
        order: index,
        hidden: false,
        locked: false,
        ...(index === DECK.slides.length - 1
          ? { transition: { name: WIPE.name, ms: WIPE.ms } }
          : {}),
        ...(index === 1 ? { speakerNotes: DECK.speakerNotes } : {}),
      },
    ]),
  )
  const layout = {
    version: 1,
    present: { transition: { name: 'push', ms: 500 } },
    frames,
  }
  await Promise.all([
    ...DECK.slides.map((name) =>
      copyFile(join(DECK_PAGES, `${name}.html`), join(folder, `${name}.html`)),
    ),
    writeFile(
      join(folder, 'layout.json'),
      `${JSON.stringify(layout, null, 2)}\n`,
    ),
  ])
  await listPage(root, DECK.project, DECK.page)
  return 'laid'
}
