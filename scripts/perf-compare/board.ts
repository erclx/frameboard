import { copyFileSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'

/** The page a measuring tab opens, the largest on the board. */
export const OPEN_PAGE = { project: 'gallery', page: 'grid', frames: 40 }

/** The frame each measured write edits, on no page a tab has open. */
export const UNRELATED_FRAME = 'project-01/page-1/frame-04'

// The rest of the board, large across its projects and on no one page.
const PROJECTS = 32
const PAGES = 6
const FRAMES = 5
// How many frames of each small page hug, over half the board in all.
const HUGGING = 3

const CARDS = 24
const COLUMNS = 10
const SIZE = { width: 1440, height: 900 }

/** Writes the board into an empty folder, the same bytes every time. */
export function writeBoard(root: string): void {
  writeFileSync(join(root, 'board.json'), '{ "version": 1 }\n')
  copySheet('tokens.css', join(root, 'tokens.css'))
  writeProject(root, OPEN_PAGE.project, [OPEN_PAGE.page], OPEN_PAGE.frames, 0)
  const pages = Array.from({ length: PAGES }, (_, index) => `page-${index + 1}`)
  for (let index = 1; index <= PROJECTS; index += 1) {
    writeProject(root, `project-${pad(index)}`, pages, FRAMES, HUGGING)
  }
}

/** Rewrites the unrelated frame, each step with bytes of its own. */
export function editUnrelated(root: string, step: number): void {
  writeFrame(root, UNRELATED_FRAME, `${UNRELATED_FRAME}, edit ${step}`)
}

function writeProject(
  root: string,
  project: string,
  pages: string[],
  count: number,
  hugging: number,
): void {
  const folder = join(root, project)
  mkdirSync(join(folder, 'assets'), { recursive: true })
  copySheet('site.css', join(folder, 'assets/site.css'))
  writeFileSync(
    join(folder, 'project.json'),
    `${JSON.stringify({ version: 1, pages })}\n`,
  )
  for (const page of pages)
    writePage(root, `${project}/${page}`, count, hugging)
}

function writePage(
  root: string,
  page: string,
  count: number,
  hugging: number,
): void {
  mkdirSync(join(root, page))
  const frames: Record<string, object> = {}
  for (let index = 0; index < count; index += 1) {
    const name = `frame-${pad(index)}`
    writeFrame(root, `${page}/${name}`, `${page}/${name}`)
    frames[name] = {
      x: (index % COLUMNS) * (SIZE.width + 80),
      y: Math.floor(index / COLUMNS) * (SIZE.height + 80),
      ...SIZE,
      order: index,
      hidden: false,
      locked: false,
      ...(index < hugging ? { hugHeight: true } : {}),
    }
  }
  // Last, since a server measures a hugging frame newer than its layout again.
  writeFileSync(
    join(root, page, 'layout.json'),
    `${JSON.stringify({ version: 1, frames }, null, 2)}\n`,
  )
}

function writeFrame(root: string, ref: string, title: string): void {
  const cards = Array.from(
    { length: CARDS },
    (_, index) =>
      `<article class="card"><h2>Card ${index + 1}</h2><p>Card text that wraps over a line or two. <span class="tag">Tag ${index + 1}</span></p></article>`,
  )
  const html = readFileSync(join(import.meta.dirname, 'frame.html'), 'utf8')
    .replaceAll('%TITLE%', title)
    .replace('%CARDS%', cards.join('\n'))
  writeFileSync(join(root, `${ref}.html`), html)
}

function copySheet(name: string, path: string): void {
  copyFileSync(join(import.meta.dirname, name), path)
}

function pad(index: number): string {
  return String(index).padStart(2, '0')
}
