import { existsSync } from 'node:fs'
import { mkdir, writeFile } from 'node:fs/promises'
import { join } from 'node:path'

import { listPage, relistKept } from '../drive-seed.ts'

/**
 * The page holding two rows of three shown frames named in canvas order, the
 * top left one drawn last and a few pixels low, with a hidden frame in the
 * lower row, so a step's order and the Layers panel's read apart.
 */
const WALK = {
  project: 'webapp',
  page: 'walk',
  width: 400,
  height: 300,
  // Bottom of the stack first.
  frames: [
    { name: 'two', x: 480, y: 0, hidden: false },
    { name: 'four', x: 0, y: 400, hidden: false },
    { name: 'six', x: 1440, y: 400, hidden: false },
    { name: 'hidden', x: 480, y: 400, hidden: true },
    { name: 'three', x: 960, y: 0, hidden: false },
    { name: 'five', x: 960, y: 400, hidden: false },
    { name: 'one', x: 0, y: 12, hidden: false },
  ],
}

export async function lay(root: string): Promise<'laid' | 'kept'> {
  const { project, page, width, height } = WALK
  const folder = join(root, project, page)
  if (existsSync(folder)) {
    await relistKept(root, project, page)
    return 'kept'
  }
  await mkdir(folder)

  const frames = Object.fromEntries(
    WALK.frames.map(({ name, ...placed }, order) => [
      name,
      { ...placed, width, height, order, locked: false },
    ]),
  )
  await Promise.all([
    ...WALK.frames.map(({ name }) =>
      writeFile(join(folder, `${name}.html`), walkHtml(name)),
    ),
    writeFile(
      join(folder, 'layout.json'),
      `${JSON.stringify({ version: 1, frames }, null, 2)}\n`,
    ),
  ])
  await listPage(root, project, page)
  return 'laid'
}

/** A frame naming itself in the board's tokens, so it passes every content rule. */
function walkHtml(name: string): string {
  const style =
    'margin: 0; padding: 16px; background: var(--surface); color: var(--text); font-family: var(--font-text)'
  return `<!doctype html>
<html lang="en">
  <head><meta charset="utf-8" /><title>${name}</title></head>
  <body style="${style}"><h1>${name}</h1></body>
</html>
`
}
