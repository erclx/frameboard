import { parse } from 'parse5'
import { adapter } from 'parse5-htmlparser2-tree-adapter'

type Element = ReturnType<typeof adapter.createElement>

export type Theme = 'dark' | 'light'

export const THEMES: readonly Theme[] = ['dark', 'light']

export interface CarriedFrame {
  readonly page: string
  readonly stem: string
  /** A single file switches on `data-theme`, where a pair draws one file per theme. */
  readonly single: boolean
}

export interface FrameFile {
  readonly file: string
  readonly theme: Theme
}

export interface Resolution {
  readonly frames: readonly CarriedFrame[]
  readonly missing: readonly string[]
}

export type CanvasFiles = ReadonlyMap<string, readonly string[]>

const FILES_START = '<!-- design:sync:start -->'
const FILES_END = '<!-- design:sync:end -->'
const PICKED_COLOR = /#ffd400/i

/** Reads every `page/stem` the index's Surfaces table cites in its Frames column. */
export function parseCarried(index: string): string[] {
  const carried: string[] = []
  let inSurfaces = false
  for (const line of index.split('\n')) {
    if (line.startsWith('## ')) inSurfaces = line === '## Surfaces'
    if (!inSurfaces || !line.startsWith('|')) continue
    const cells = line.split('|').map((cell) => cell.trim())
    const frames = cells[2] ?? ''
    for (const match of frames.matchAll(/`([^`/]+\/[^`/]+)`/g)) {
      const ref = match[1]
      if (ref !== undefined && !carried.includes(ref)) carried.push(ref)
    }
  }
  return carried
}

/** Maps each `page/stem` to its single file or its dark and light pair. */
export function resolveCarried(
  carried: readonly string[],
  canvas: CanvasFiles,
): Resolution {
  const frames: CarriedFrame[] = []
  const missing: string[] = []
  for (const ref of carried) {
    const [page = '', stem = ''] = ref.split('/')
    const files = canvas.get(page) ?? []
    if (files.includes(`${stem}.html`)) {
      frames.push({ page, stem, single: true })
    } else if (
      THEMES.every((theme) => files.includes(`${stem}-${theme}.html`))
    ) {
      frames.push({ page, stem, single: false })
    } else {
      missing.push(ref)
    }
  }
  return { frames, missing }
}

/** The canvas files a carried frame is drawn from, one per theme for a pair. */
export function sourceFiles(frame: CarriedFrame): FrameFile[] {
  if (frame.single) return [{ file: `${frame.stem}.html`, theme: 'dark' }]
  return THEMES.map((theme) => ({
    file: `${frame.stem}-${theme}.html`,
    theme,
  }))
}

/** Reports each canvas `picked-` frame the index does not carry, themes folded. */
export function uncarriedPicked(
  carried: readonly string[],
  canvas: CanvasFiles,
): string[] {
  const reported = new Set<string>()
  for (const [page, files] of canvas) {
    for (const file of files) {
      if (!file.startsWith('picked-')) continue
      const name = file.replace(/\.html$/, '')
      const stem = name.replace(/-(dark|light)$/, '')
      if (
        !carried.includes(`${page}/${name}`) &&
        !carried.includes(`${page}/${stem}`)
      ) {
        reported.add(`${page}/${stem}`)
      }
    }
  }
  return [...reported]
}

/** Cuts the picked marker's elements out of a frame and leaves every other byte. */
export function stripPicked(html: string): string {
  const document = parse(html.replace(/^﻿/, ' '), {
    treeAdapter: adapter,
    sourceCodeLocationInfo: true,
  })
  const cuts: [number, number][] = []
  const walk = (children: readonly unknown[]): void => {
    for (const child of children as Element[]) {
      if (child.type !== 'tag') continue
      const style = child.attribs['style'] ?? ''
      const at = child.sourceCodeLocation
      if (PICKED_COLOR.test(style) && at) {
        cuts.push([at.startOffset, at.endOffset])
        continue
      }
      walk(child.children)
    }
  }
  walk(document.children)
  let out = html
  for (const [start, end] of cuts.reverse()) {
    out = out.slice(0, start) + out.slice(end)
  }
  return out
}

export interface Drift {
  readonly changed: readonly string[]
  readonly missing: readonly string[]
}

/** Compares each canvas file, marker cut, against its tracked copy. */
export function classifyDrift(
  canvas: ReadonlyMap<string, string>,
  tracked: ReadonlyMap<string, string>,
): Drift {
  const changed: string[] = []
  const missing: string[] = []
  for (const [path, html] of canvas) {
    const copy = tracked.get(path)
    if (copy === undefined) missing.push(path)
    else if (copy !== stripPicked(html)) changed.push(path)
  }
  return { changed, missing }
}

export interface FileRow {
  readonly ref: string
  readonly box: string
  readonly files: readonly string[]
}

/** The files table the sync writes between the index's two markers. */
export function renderFilesSection(rows: readonly FileRow[]): string {
  const lines = [
    '| Frame | Box | Files |',
    '| --- | --- | --- |',
    ...rows.map(
      (row) =>
        `| \`${row.ref}\` | ${row.box} | ${row.files.map((f) => `\`${f}\``).join(', ')} |`,
    ),
  ]
  return `${FILES_START}\n\n${lines.join('\n')}\n\n${FILES_END}`
}

/** Replaces the marked block, or appends a Files section when the index has none. */
export function spliceFilesSection(index: string, section: string): string {
  const start = index.indexOf(FILES_START)
  const end = index.indexOf(FILES_END)
  if (start === -1 || end === -1) {
    return `${index.trimEnd()}\n\n## Files\n\n${section}\n`
  }
  return index.slice(0, start) + section + index.slice(end + FILES_END.length)
}
