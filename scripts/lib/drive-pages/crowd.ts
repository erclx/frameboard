import { existsSync } from 'node:fs'
import { mkdir, writeFile } from 'node:fs/promises'
import { join } from 'node:path'

import { FRAME_GAP, FRAME_SIZES } from '@/shared/frame-sizes'

import { listPage, relistKept } from '../drive-seed.ts'

/** The page a reel pans across, which no committed board carries. */
const CROWD = { project: 'marketing', page: 'crowd', count: 40, columns: 8 }

export async function lay(root: string): Promise<'laid' | 'kept'> {
  const folder = join(root, CROWD.project, CROWD.page)
  if (existsSync(folder)) {
    await relistKept(root, CROWD.project, CROWD.page)
    return 'kept'
  }
  await mkdir(folder)

  const { width, height } = FRAME_SIZES.desktop
  const frames: Record<string, object> = {}
  const writes: Promise<void>[] = []
  for (let index = 0; index < CROWD.count; index++) {
    const name = `crowd-${String(index + 1).padStart(2, '0')}`
    frames[name] = {
      x: (index % CROWD.columns) * (width + FRAME_GAP),
      y: Math.floor(index / CROWD.columns) * (height + FRAME_GAP),
      width,
      height,
      order: index,
      hidden: false,
      locked: false,
    }
    writes.push(writeFile(join(folder, `${name}.html`), frameHtml(name, index)))
  }
  writes.push(
    writeFile(
      join(folder, 'layout.json'),
      `${JSON.stringify({ version: 1, frames }, null, 2)}\n`,
    ),
    listPage(root, CROWD.project, CROWD.page),
  )
  await Promise.all(writes)
  return 'laid'
}

/**
 * A frame carrying its number in the board's tokens, at a height of its own,
 * so it draws in both themes and passes every content rule a reel would show.
 */
function frameHtml(name: string, index: number): string {
  const { height } = FRAME_SIZES.desktop
  const style = `margin: 0; height: ${height}px; display: grid; place-items: center; background: var(--surface); color: var(--text); font-family: var(--font-text); font-size: 96px`
  return `<!doctype html>
<html lang="en">
  <head><meta charset="utf-8" /><title>${name}</title></head>
  <body style="${style}"><h1>${index + 1}</h1></body>
</html>
`
}
