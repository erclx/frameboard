import type { DefaultTreeAdapterTypes } from 'parse5'

import { type Element, hasTag, parseFrame } from '../edit/address'

/** Past this many changed elements, one glow over the frame reads better than many. */
const MOST_ELEMENTS = 8

export interface ElementDiff {
  /** The changed elements' indices in the new file, outermost only. */
  elements: number[]
  /** How many more elements the old file held unmatched than the new one. */
  removed: number
  /** Too wide to name by element, or a new file the indices cannot address. */
  whole: boolean
}

/**
 * Which elements of `after` an agent changed against `before`, matching both
 * in index order by tag, attributes, and own text with a longest common
 * subsequence. An unmatched element inside another unmatched one is left out,
 * so an inserted card glows once and not with each child.
 */
export function changedElements(before: string, after: string): ElementDiff {
  const old = parseFrame(before)
  const next = parseFrame(after)
  // Every index after an element the file does not state names another element.
  if (next.unstated) return { elements: [], removed: 0, whole: true }
  const matched = matchElements(
    old.elements.map(signature),
    next.elements.map(signature),
  )
  const added = outermost(next.elements, matched.after)
  const dropped = outermost(old.elements, matched.before)
  const unmatched = next.elements.length - matched.after.size
  const body = next.elements.filter((element) => inBody(element)).length
  return {
    elements: added,
    removed: Math.max(0, dropped.length - added.length),
    whole: added.length > MOST_ELEMENTS || unmatched * 2 > body,
  }
}

/** The indices on each side that the longest common subsequence pairs up. */
function matchElements(
  before: string[],
  after: string[],
): { before: Set<number>; after: Set<number> } {
  // A shared head and tail pair up without the table, which keeps a small edit cheap.
  let head = 0
  while (
    head < before.length &&
    head < after.length &&
    before[head] === after[head]
  ) {
    head += 1
  }
  let tail = 0
  while (
    tail < before.length - head &&
    tail < after.length - head &&
    before[before.length - 1 - tail] === after[after.length - 1 - tail]
  ) {
    tail += 1
  }
  const pairs: [number, number][] = []
  for (let at = 0; at < head; at++) pairs.push([at, at])
  for (let at = 1; at <= tail; at++) {
    pairs.push([before.length - at, after.length - at])
  }

  const rows = before.length - head - tail
  const columns = after.length - head - tail
  const width = columns + 1
  // lengths[i][j] is the subsequence length of the middles from i and j on.
  const lengths = new Uint32Array((rows + 1) * width)
  for (let i = rows - 1; i >= 0; i--) {
    for (let j = columns - 1; j >= 0; j--) {
      lengths[i * width + j] =
        before[head + i] === after[head + j]
          ? (lengths[(i + 1) * width + j + 1] ?? 0) + 1
          : Math.max(
              lengths[(i + 1) * width + j] ?? 0,
              lengths[i * width + j + 1] ?? 0,
            )
    }
  }
  let i = 0
  let j = 0
  while (i < rows && j < columns) {
    if (before[head + i] === after[head + j]) {
      pairs.push([head + i, head + j])
      i += 1
      j += 1
    } else if (
      (lengths[(i + 1) * width + j] ?? 0) >= (lengths[i * width + j + 1] ?? 0)
    ) {
      i += 1
    } else {
      j += 1
    }
  }
  return {
    before: new Set(pairs.map(([at]) => at)),
    after: new Set(pairs.map(([, at]) => at)),
  }
}

/** The unmatched indices whose parent element is matched. */
function outermost(elements: readonly Element[], matched: Set<number>) {
  const index = new Map(elements.map((element, at) => [element, at]))
  return elements.flatMap((element, at) => {
    if (matched.has(at)) return []
    const parent = element.parentNode
    const parentAt = parent && hasTag(parent) ? index.get(parent) : undefined
    return parentAt !== undefined && !matched.has(parentAt) ? [] : [at]
  })
}

function inBody(element: Element): boolean {
  for (let node = element.parentNode; node; node = node.parentNode) {
    if (!hasTag(node)) return false
    if (node.tagName === 'body') return true
  }
  return false
}

function signature(element: Element): string {
  const attributes = element.attrs
    .map(({ name, value }) => `${name}=${value}`)
    .sort()
  return JSON.stringify([element.tagName, attributes, ownText(element)])
}

function ownText(element: Element): string {
  return element.childNodes
    .filter(
      (node): node is DefaultTreeAdapterTypes.TextNode =>
        node.nodeName === '#text',
    )
    .map((node) => node.value)
    .join('')
    .replace(/\s+/g, ' ')
    .trim()
}
