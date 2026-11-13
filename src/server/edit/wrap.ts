import { type Element, hasTag, parseFrame } from './address'
import { type EditRefused, refuse } from './apply'
import { type ElementSpan, spanText } from './element-span'
import { placeElement, type PlaceFacts, type Spot } from './place'

/** The flow a wrap gives its container, as the Layout section names one. */
export interface WrapFlow {
  readonly direction: 'row' | 'column'
  /** The space between the members, in CSS pixels. */
  readonly gap: number
}

export type Wrapped =
  | {
      readonly ok: true
      readonly html: string
      /** The container's index in the file as written. */
      readonly index: number
      /** Each member's index as written, in the order the request named them. */
      readonly members: readonly number[]
      /** The parent's whole element on both sides, which one undo puts back. */
      readonly span: ElementSpan
      /** Where each index of the source now sits, null for none. */
      readonly remap: (index: number) => number | null
    }
  | EditRefused

/** The wrappers a container cannot sit in, or be made from. */
const ROOTS = new Set(['html', 'head', 'body'])

function px(value: number): string {
  return `${Math.round(value * 100) / 100}px`
}

function children(element: Element): Element[] {
  return element.childNodes.filter(hasTag)
}

function subtree(element: Element): number {
  return children(element).reduce((count, child) => count + subtree(child), 1)
}

function isFree(facts: PlaceFacts | undefined): boolean {
  const position = facts?.position?.trim().toLowerCase()
  return position === 'absolute' || position === 'fixed'
}

/**
 * Wraps the sibling elements `indexes` names in one new `div` laid out as
 * `flow`, written at the first one's place, with every one moved into it in
 * document order. A free member leaves the flow it is wrapped in otherwise,
 * so each puts back `position`, `left`, and `top` as back in flow does, and
 * the container takes `spot` instead, placed freely where the group sat, or
 * sits in the flow when `spot` is null. `facts` is the static cascade read
 * by the same index. Elements that are not siblings, the document's own
 * wrappers, and a parent the file does not state are refused, and the
 * output is parsed again and refused as `verify-failed` unless only the
 * parent's contents changed, holding the container and its members.
 */
export function wrapElements(
  source: string,
  indexes: readonly number[],
  flow: WrapFlow,
  spot: Pick<Spot, 'left' | 'top'> | null,
  facts: readonly PlaceFacts[],
): Wrapped {
  const tree = parseFrame(source)
  const named = [...new Set(indexes)].toSorted((a, b) => a - b)
  const members = named.map((index) =>
    Number.isInteger(index) ? tree.elements[index] : undefined,
  )
  const [first] = members
  const parent = first?.parentNode
  if (
    named.length !== indexes.length ||
    named.length === 0 ||
    !first ||
    !parent ||
    !hasTag(parent) ||
    members.some(
      (member) =>
        !member?.sourceCodeLocation?.startTag ||
        ROOTS.has(member.tagName) ||
        member.parentNode !== parent,
    )
  ) {
    return refuse(
      'invalid-address',
      'a wrap takes stated sibling elements of one parent, each named once',
    )
  }
  const stated = parent.sourceCodeLocation
  if (parent.tagName === 'html' || !stated?.startTag) {
    return refuse(
      'invalid-container',
      `the <${parent.tagName}> holding them is not stated in the file, so nothing was written`,
    )
  }
  const parentIndex = tree.elements.indexOf(parent)

  // Back in flow writes each free member's start tag alone, so no index moves.
  let html = source
  for (const index of named) {
    if (!isFree(facts[index])) continue
    const placed = placeElement(html, index, null, facts)
    if (!placed.ok) return placed
    html = placed.html
  }

  const flowed = parseFrame(html)
  const inFlow = named.map((index) => flowed.elements[index])
  const ranges = inFlow.map((member) => {
    const location = member?.sourceCodeLocation
    return location
      ? ([location.startOffset, location.endOffset] as const)
      : null
  })
  const [start] = ranges
  if (!start || ranges.some((range) => !range)) {
    return refuse(
      'verify-failed',
      'a member lost its place in the file, so nothing was written',
    )
  }
  const indent = /\n[ \t]*$/.exec(html.slice(0, start[0]))?.[0] ?? ''
  const inner = indent === '' ? '' : `${indent}  `
  const declarations = [
    'display: flex',
    `flex-direction: ${flow.direction}`,
    `gap: ${px(flow.gap)}`,
    ...(spot
      ? ['position: absolute', `left: ${px(spot.left)}`, `top: ${px(spot.top)}`]
      : []),
  ]
  const container = `<div style="${declarations.join('; ')}">${ranges
    .map((range) => `${inner}${html.slice(range?.[0], range?.[1])}`)
    .join('')}${indent}</div>`

  // Later members leave with the whitespace before them, from the end back,
  // so each range still names the bytes it was read from.
  let wrapped = html
  for (const range of ranges.slice(1).toReversed()) {
    if (!range) continue
    const lead = /\s*$/.exec(wrapped.slice(0, range[0]))?.[0].length ?? 0
    wrapped = wrapped.slice(0, range[0] - lead) + wrapped.slice(range[1])
  }
  wrapped = wrapped.slice(0, start[0]) + container + wrapped.slice(start[1])

  const order = [
    ...tree.elements.slice(0, named[0]),
    ...members.flatMap((member) =>
      member
        ? tree.elements.slice(
            tree.elements.indexOf(member),
            tree.elements.indexOf(member) + subtree(member),
          )
        : [],
    ),
  ]
  const moved = new Set(order)
  order.push(...tree.elements.filter((element) => !moved.has(element)))
  const at = new Map(
    order.map((element, place) => [
      tree.elements.indexOf(element),
      place < (named[0] ?? 0) ? place : place + 1,
    ]),
  )
  const index = named[0] ?? 0

  const written = parseFrame(wrapped)
  const box = written.elements[index]
  const after = written.elements[parentIndex]
  const end = stated.endOffset
  const unchanged =
    written.elements.length === tree.elements.length + 1 &&
    box?.tagName === 'div' &&
    box.parentNode === after &&
    children(box)
      .map(({ tagName }) => tagName)
      .join() === members.map((member) => member?.tagName).join() &&
    wrapped.slice(0, stated.startTag.endOffset) ===
      source.slice(0, stated.startTag.endOffset) &&
    wrapped.slice(wrapped.length - (source.length - end)) === source.slice(end)
  if (!after || !unchanged) {
    return refuse(
      'verify-failed',
      'the wrap would change more than its parent’s contents, so nothing was written',
    )
  }
  return {
    ok: true,
    html: wrapped,
    index,
    members: indexes.map((named) => at.get(named) ?? named),
    span: {
      scope: 'element',
      index: parentIndex,
      count: written.elements.length,
      before: spanText(source, parent, 'element'),
      after: spanText(wrapped, after, 'element'),
    },
    remap: (old) => at.get(old) ?? null,
  }
}
