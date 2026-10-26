import type { DefaultTreeAdapterTypes } from 'parse5'

import { buildCascade, type Cascade } from '@/server/checks/cascade'
import type { FrameSource, Sheet } from '@/server/checks/frame-source'
import type { Layout, TreeElement } from '@/shared/records/elements'

import { type Element, hasTag, parseFrame } from './address'
import { type EditRefused, refuse } from './apply'

/** How long a text-only element's text may run as its name. */
const NAME_LENGTH = 40

/** What the layout read takes from the cascade, with the shorthand that sets the direction. */
const LAYOUT_PROPERTIES: ReadonlySet<string> = new Set([
  'display',
  'flex-direction',
  'flex-flow',
])

/**
 * A frame's elements under `body` in index order, each with its parent and
 * name, read from the same parse and the same index `edit` addresses. A
 * frame where the browser builds an element the file does not state is
 * refused, since every index after it would name another element.
 * `layouts` is `elementLayouts`'s read by the same index, and an element it
 * does not reach reads as `block`.
 */
export function elementTree(
  source: string,
  layouts: readonly Layout[] = [],
): TreeElement[] | EditRefused {
  const tree = parseFrame(source)
  if (tree.unstated) {
    return refuse(
      'address-mismatch',
      `the browser builds a <${tree.unstated.tagName}> the file does not state, so indices after it disagree`,
    )
  }
  const index = new Map(tree.elements.map((element, at) => [element, at]))
  const body = tree.elements.find((element) => element.tagName === 'body')
  const listed: TreeElement[] = []
  // Elements arrive parents first, so one whose parent is not listed sits outside `body`.
  const inBody = new Set<Element>()
  for (const [at, element] of tree.elements.entries()) {
    const parent = element.parentNode
    if (!body || !parent || !hasTag(parent)) continue
    if (parent !== body && !inBody.has(parent)) continue
    inBody.add(element)
    listed.push({
      index: at,
      parent: parent === body ? null : (index.get(parent) ?? null),
      tag: element.tagName,
      name: elementName(element),
      textOnly: ownText(element) !== null,
      layout: layouts[at] ?? 'block',
    })
  }
  return listed
}

/**
 * Every element's layout by the edit index, read from the static cascade
 * over the token sheets and the frame's own, as `frameStyles` reads colors,
 * so a culled frame with no iframe still answers. Every media query counts
 * as applying, so a frame that flips its direction at a breakpoint reads as
 * whichever rule wins statically.
 */
export function elementLayouts(source: FrameSource, tokens: Sheet[]): Layout[] {
  const cascade = buildCascade(source, tokens, {
    properties: LAYOUT_PROPERTIES,
  })
  return source.elements.map((element) => layoutOf(cascade, element))
}

function layoutOf(
  cascade: Cascade,
  element: FrameSource['elements'][number],
): Layout {
  const display = words(cascade.specified(element, 'display')?.value)
  if (display.includes('grid') || display.includes('inline-grid')) {
    return 'grid'
  }
  if (!display.includes('flex') && !display.includes('inline-flex')) {
    return 'block'
  }
  // `flex-flow` resets the direction to `row` when it names none.
  const direction = words(cascade.specified(element, 'flex-direction')?.value)
  return direction.some((word) => word.startsWith('column')) ? 'column' : 'row'
}

function words(value: string | undefined): string[] {
  return value?.trim().toLowerCase().split(/\s+/) ?? []
}

/**
 * What an element is called in the layers rows, the inspector, and the
 * `selection` verb: its `data-name`, else a text-only element's text, else
 * an `img`'s `alt`, else its tag. `id` and `aria-label` already mean
 * something to a frame's CSS, scripts, and readers, so neither names it.
 */
export function elementName(element: Element): string {
  const named = attribute(element, 'data-name')?.trim()
  if (named) return named
  const text = ownText(element)
  if (text !== null) return text.slice(0, NAME_LENGTH)
  const alt = element.tagName === 'img' ? attribute(element, 'alt')?.trim() : ''
  return alt || element.tagName
}

/** The whitespace-collapsed text of an element holding text alone, else null. */
function ownText(element: Element): string | null {
  const texts = element.childNodes.filter(isText)
  if (texts.length === 0 || texts.length !== element.childNodes.length) {
    return null
  }
  const text = texts
    .map((node) => node.value)
    .join('')
    .replace(/\s+/g, ' ')
    .trim()
  return text === '' ? null : text
}

function isText(
  node: DefaultTreeAdapterTypes.ChildNode,
): node is DefaultTreeAdapterTypes.TextNode {
  return node.nodeName === '#text'
}

function attribute(element: Element, name: string): string | undefined {
  return element.attrs.find((attr) => attr.name === name)?.value
}
