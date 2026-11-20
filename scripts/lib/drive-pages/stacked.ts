import { existsSync } from 'node:fs'
import { mkdir, writeFile } from 'node:fs/promises'
import { join } from 'node:path'

import { listPage, relistKept } from '../drive-seed.ts'

/**
 * The page holding three frames in a column 8 px apart, a clean one over one
 * with a warning alone over one with an error, so the lower two labels have
 * no room at any zoom and each frame's corner dot shows in its own hue.
 */
const STACKED = {
  project: 'webapp',
  page: 'stacked',
  width: 640,
  height: 240,
  gap: 8,
  frames: [
    { name: 'top', style: 'font-family: var(--font-text)' },
    { name: 'warned', style: 'font-family: sans-serif' },
    {
      name: 'broken',
      style:
        'background: #fafafa; color: #222222; font-family: var(--font-text)',
    },
  ],
}

export async function lay(root: string): Promise<'laid' | 'kept'> {
  const folder = join(root, STACKED.project, STACKED.page)
  if (existsSync(folder)) {
    await relistKept(root, STACKED.project, STACKED.page)
    return 'kept'
  }
  await mkdir(folder)

  const layout = {
    version: 1,
    frames: Object.fromEntries(
      STACKED.frames.map(({ name }, index) => [
        name,
        {
          x: 0,
          y: index * (STACKED.height + STACKED.gap),
          width: STACKED.width,
          height: STACKED.height,
          order: index,
          hidden: false,
          locked: false,
        },
      ]),
    ),
  }
  await Promise.all([
    ...STACKED.frames.map(({ name, style }) =>
      writeFile(join(folder, `${name}.html`), stackedHtml(name, style)),
    ),
    writeFile(
      join(folder, 'layout.json'),
      `${JSON.stringify(layout, null, 2)}\n`,
    ),
  ])
  await listPage(root, STACKED.project, STACKED.page)
  return 'laid'
}

/** A frame naming itself in one heading, whose body takes `style` for the rule it trips or passes. */
function stackedHtml(name: string, style: string): string {
  return `<!doctype html>
<html lang="en">
  <head><meta charset="utf-8" /><title>${name}</title></head>
  <body style="margin: 0; padding: 16px; ${style}"><h1>${name}</h1></body>
</html>
`
}
