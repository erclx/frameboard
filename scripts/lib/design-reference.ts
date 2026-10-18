import { parse } from 'parse5'
import { adapter } from 'parse5-htmlparser2-tree-adapter'

type Element = ReturnType<typeof adapter.createElement>

export type Theme = 'dark' | 'light'

export const THEMES: readonly Theme[] = ['dark', 'light']

/** One frame the index carries: a canvas `page/stem` filed under a surface folder. */
export interface Carried {
  readonly ref: string
  readonly folder: string
}

export interface CarriedFrame {
  readonly page: string
  readonly stem: string
  readonly folder: string
  /** The file stem under the folder, with the canvas's `picked-` and folder prefixes dropped. */
  readonly name: string
  /** A single file switches on `data-theme`, where a pair draws one file per theme. */
  readonly single: boolean
}

export interface FrameFile {
  /** The canvas file the frame is read from. */
  readonly file: string
  /** The reference file it is written to, under the frame's folder. */
  readonly out: string
  readonly theme: Theme
}

export interface Resolution {
  readonly frames: readonly CarriedFrame[]
  readonly missing: readonly string[]
  /** Reference paths two carried frames would both write. */
  readonly clashes: readonly string[]
}

export type CanvasFiles = ReadonlyMap<string, readonly string[]>

const FILES_START = '<!-- design:sync:start -->'
const FILES_END = '<!-- design:sync:end -->'
const PICKED_COLOR = /#ffd400/i
const CANVAS_KIT = '../01-kit/'
const REFERENCE_KIT = '../kit/'

function cell(text: string | undefined): string {
  return (text ?? '').replace(/`/g, '').trim()
}

/** Reads each Surfaces row's folder and every `page/stem` its Frames column cites. */
export function parseCarried(index: string): Carried[] {
  const carried: Carried[] = []
  let inSurfaces = false
  for (const line of index.split('\n')) {
    if (line.startsWith('## ')) inSurfaces = line === '## Surfaces'
    if (!inSurfaces || !line.startsWith('|')) continue
    const cells = line.split('|').map((text) => text.trim())
    const folder = cell(cells[2])
    for (const match of (cells[3] ?? '').matchAll(/`([^`/]+\/[^`/]+)`/g)) {
      const ref = match[1]
      if (ref !== undefined && !carried.some((entry) => entry.ref === ref)) {
        carried.push({ ref, folder })
      }
    }
  }
  return carried
}

/** Drops the canvas's `picked-` prefix and a leading `<folder>-` from a stem. */
export function referenceName(stem: string, folder: string): string {
  const bare = stem.replace(/^picked-/, '')
  const trimmed = bare.startsWith(`${folder}-`)
    ? bare.slice(folder.length + 1)
    : bare
  return trimmed === '' ? bare : trimmed
}

/** Maps each carried frame to its single file or dark and light pair. */
export function resolveCarried(
  carried: readonly Carried[],
  canvas: CanvasFiles,
): Resolution {
  const frames: CarriedFrame[] = []
  const missing: string[] = []
  const clashes: string[] = []
  const taken = new Set<string>()
  for (const { ref, folder } of carried) {
    const [page = '', stem = ''] = ref.split('/')
    const files = canvas.get(page) ?? []
    const name = referenceName(stem, folder)
    const single = files.includes(`${stem}.html`)
    if (
      !single &&
      !THEMES.every((theme) => files.includes(`${stem}-${theme}.html`))
    ) {
      missing.push(ref)
      continue
    }
    const target = `${folder}/${name}`
    if (taken.has(target)) clashes.push(target)
    taken.add(target)
    frames.push({ page, stem, folder, name, single })
  }
  return { frames, missing, clashes }
}

/** The canvas files a carried frame is drawn from, one per theme for a pair. */
export function sourceFiles(frame: CarriedFrame): FrameFile[] {
  if (frame.single) {
    return [
      { file: `${frame.stem}.html`, out: `${frame.name}.html`, theme: 'dark' },
    ]
  }
  return THEMES.map((theme) => ({
    file: `${frame.stem}-${theme}.html`,
    out: `${frame.name}-${theme}.html`,
    theme,
  }))
}

/** Reports each canvas `picked-` frame the index does not carry, themes folded. */
export function uncarriedPicked(
  carried: readonly Carried[],
  canvas: CanvasFiles,
): string[] {
  const refs = carried.map((entry) => entry.ref)
  const reported = new Set<string>()
  for (const [page, files] of canvas) {
    for (const file of files) {
      if (!file.startsWith('picked-')) continue
      const name = file.replace(/\.html$/, '')
      const stem = name.replace(/-(dark|light)$/, '')
      if (
        !refs.includes(`${page}/${name}`) &&
        !refs.includes(`${page}/${stem}`)
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

/** What the folder holds of a canvas frame: no marker, and links to the folder's kit. */
export function toReference(html: string): string {
  return stripPicked(html).replaceAll(CANVAS_KIT, REFERENCE_KIT)
}

export interface Drift {
  readonly changed: readonly string[]
  readonly missing: readonly string[]
  readonly stray: readonly string[]
}

/** Compares what a sync would write against the files the folder holds. */
export function classifyDrift(
  expected: ReadonlyMap<string, string | Uint8Array>,
  tracked: ReadonlyMap<string, string | Uint8Array>,
): Drift {
  const changed: string[] = []
  const missing: string[] = []
  for (const [path, data] of expected) {
    const copy = tracked.get(path)
    if (copy === undefined) missing.push(path)
    else if (!Buffer.from(copy).equals(Buffer.from(data))) changed.push(path)
  }
  const stray = [...tracked.keys()].filter((path) => !expected.has(path))
  return { changed, missing, stray }
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
