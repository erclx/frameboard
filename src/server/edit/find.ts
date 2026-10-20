import { readFile } from 'node:fs/promises'

import type { DefaultTreeAdapterTypes } from 'parse5'

import { isCode } from '@/server/board/json-record'
import { resolveProject } from '@/server/board/refs'
import { scanProject } from '@/server/board/scan'
import type { FindHit, FindResult } from '@/shared/records/find'
import type { FrameRecord } from '@/shared/records/list'

import { contentHash, type Element, parseFrame } from './address'
import { elementTree } from './elements'

/** More hits than a panel can usefully list, so a one-letter query stays cheap to send. */
export const MAX_HITS = 200

/** How much of a text hit's text shows before the match, and in all. */
const SNIPPET_BEFORE = 20
const SNIPPET_LENGTH = 80

/** Elements whose text is code rather than copy. */
const NOT_COPY = new Set(['script', 'style'])

/**
 * Every hit for `query` across the shown frames of a project, in page order
 * and then stacking order, matching case-insensitively against each frame's
 * name, each element's name by the layers rule, and each element's own text.
 * An element named by its own text hits as text alone, so it is not listed
 * twice, and a frame `elementTree` refuses hits by its name alone.
 */
export async function findInProject(
  root: string,
  project: string,
  query: string,
): Promise<FindResult> {
  const { name } = await resolveProject(root, project)
  const needle = query.trim().toLowerCase()
  if (needle === '') {
    return { project: name, query, hits: [], truncated: false }
  }
  const record = await scanProject(root, name)
  const frames = record.pages.flatMap((page) =>
    page.frames.filter((frame) => !frame.hidden),
  )
  const perFrame = await Promise.all(
    frames.map((frame) => frameHits(frame, needle)),
  )
  const hits = perFrame.flat()
  return {
    project: name,
    query,
    hits: hits.slice(0, MAX_HITS),
    truncated: hits.length > MAX_HITS,
  }
}

async function frameHits(
  frame: FrameRecord,
  needle: string,
): Promise<FindHit[]> {
  let bytes: Buffer
  try {
    bytes = await readFile(frame.path)
  } catch (error) {
    // A frame renamed or deleted since the scan has nothing left to match.
    if (isCode(error, 'ENOENT')) return []
    throw error
  }
  const base = { page: frame.page, frame: frame.name, ref: frame.ref }
  const hits: FindHit[] = []
  if (frame.name.toLowerCase().includes(needle)) {
    hits.push({
      ...base,
      kind: 'frame',
      index: null,
      hash: null,
      name: frame.name,
      snippet: null,
    })
  }

  const source = bytes.toString('utf8')
  const rows = elementTree(source)
  if (!Array.isArray(rows)) return hits
  const hash = contentHash(bytes)
  const { elements } = parseFrame(source)
  for (const row of rows) {
    const element = elements[row.index]
    if (!element) continue
    const text = NOT_COPY.has(row.tag) ? '' : directText(element)
    const at = text.toLowerCase().indexOf(needle)
    const namedByText = row.textOnly && !hasDataName(element)
    const address = { ...base, index: row.index, hash, name: row.name }
    if (at !== -1) {
      hits.push({ ...address, kind: 'text', snippet: snippet(text, at) })
    } else if (!namedByText && row.name.toLowerCase().includes(needle)) {
      hits.push({ ...address, kind: 'element', snippet: null })
    }
  }
  return hits
}

/**
 * The element's own text nodes joined and whitespace-collapsed, leaving out
 * its children's text, so a phrase split by an inline child is found by
 * either side and the hit selects the element holding it.
 */
function directText(element: Element): string {
  return element.childNodes
    .filter(
      (node): node is DefaultTreeAdapterTypes.TextNode =>
        node.nodeName === '#text',
    )
    .map((node) => node.value)
    .join(' ')
    .replace(/\s+/g, ' ')
    .trim()
}

function hasDataName(element: Element): boolean {
  return element.attrs.some(
    (attr) => attr.name === 'data-name' && attr.value.trim() !== '',
  )
}

function snippet(text: string, at: number): string {
  const start = Math.max(0, at - SNIPPET_BEFORE)
  const end = start + SNIPPET_LENGTH
  return `${start > 0 ? '…' : ''}${text.slice(start, end)}${end < text.length ? '…' : ''}`
}
