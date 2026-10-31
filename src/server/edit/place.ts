import { type Element, hasTag, parseFrame } from './address'
import {
  applyEdit,
  type EditRefused,
  refuse,
  type StyleDeclaration,
} from './apply'
import type { ElementSpan } from './element-span'

/** Where a placed element sits, in CSS pixels against its containing block. */
export interface Spot {
  readonly left: number
  readonly top: number
  /** Its rendered size, written only on an axis no rule sizes. */
  readonly width?: number
  readonly height?: number
}

/** What the static cascade says about one element, by the edit index. */
export interface PlaceFacts {
  /** Its `position` as written, null when no author rule sets one. */
  readonly position: string | null
  readonly width: boolean
  readonly height: boolean
}

export type Placed =
  | {
      readonly ok: true
      readonly html: string
      /** The parent's start tag first when it was written, then the element's. */
      readonly spans: readonly ElementSpan[]
    }
  | EditRefused

/** The wrappers whose static position anchors a child to the frame itself. */
const FRAME_ROOTS = new Set(['html', 'body'])

function isStatic(facts: PlaceFacts | undefined): boolean {
  const position = facts?.position?.trim().toLowerCase()
  return position === undefined || position === 'static'
}

function px(value: number): string {
  return `${Math.round(value * 100) / 100}px`
}

/** Whether `element` is anchored above `parent`, with nothing positioned between. */
function anchorsAbove(
  element: Element,
  parent: Element,
  facts: (element: Element) => PlaceFacts | undefined,
): boolean {
  const position = facts(element)?.position?.trim().toLowerCase()
  if (position !== 'absolute') return false
  for (
    let node = element.parentNode;
    node && hasTag(node) && node !== parent;
    node = node.parentNode
  ) {
    if (!isStatic(facts(node))) return false
  }
  return true
}

/** The first element under `parent`, outside `skip`'s subtree, a relative parent would re-anchor. */
function reanchored(
  parent: Element,
  skip: Element,
  facts: (element: Element) => PlaceFacts | undefined,
): Element | undefined {
  const walk = (node: Element): Element | undefined => {
    for (const child of node.childNodes) {
      if (!hasTag(child) || child === skip) continue
      if (anchorsAbove(child, parent, facts)) return child
      const found = walk(child)
      if (found) return found
    }
    return undefined
  }
  return walk(parent)
}

/**
 * Places the element at `index` at a pixel spot as `position: absolute` with
 * `left` and `top`, or puts it back in the flow when `spot` is null, which
 * drops `position`, `left`, and `top` and leaves every size as it stands. A
 * static parent other than `body` takes `position: relative` first, so the
 * spot counts from it, and is refused as `reanchors-descendant` when another
 * absolute element under it anchors above it now. `facts` is the static
 * cascade's read by the same index. Each tag is written by `applyEdit`,
 * which verifies that only that element changed.
 */
export function placeElement(
  source: string,
  index: number,
  spot: Spot | null,
  facts: readonly PlaceFacts[],
): Placed {
  const tree = parseFrame(source)
  const at = new Map(tree.elements.map((element, i) => [element, i]))
  const factsOf = (element: Element) => {
    const i = at.get(element)
    return i === undefined ? undefined : facts[i]
  }
  const element = Number.isInteger(index) ? tree.elements[index] : undefined
  const parent = element?.parentNode
  if (!element || !parent || !hasTag(parent)) {
    return refuse(
      'invalid-address',
      `the frame holds no element ${index} with a parent to place in`,
    )
  }

  const spans: ElementSpan[] = []
  let html = source
  if (spot && !FRAME_ROOTS.has(parent.tagName) && isStatic(factsOf(parent))) {
    const anchored = reanchored(parent, element, factsOf)
    if (anchored) {
      return refuse(
        'reanchors-descendant',
        `a positioned <${parent.tagName}> would move the <${anchored.tagName}> anchored above it, so nothing was written`,
      )
    }
    const written = applyEdit(
      html,
      { index: at.get(parent) ?? -1 },
      { kind: 'style', property: 'position', value: 'relative' },
    )
    if (!written.ok) return written
    html = written.html
    spans.push(written.span)
  }

  const own = facts[index]
  const declarations: StyleDeclaration[] = spot
    ? [
        { property: 'position', value: 'absolute' },
        { property: 'left', value: px(spot.left) },
        { property: 'top', value: px(spot.top) },
        ...(spot.width !== undefined && !own?.width
          ? [{ property: 'width', value: px(spot.width) }]
          : []),
        ...(spot.height !== undefined && !own?.height
          ? [{ property: 'height', value: px(spot.height) }]
          : []),
      ]
    : [
        { property: 'position', value: '' },
        { property: 'left', value: '' },
        { property: 'top', value: '' },
      ]
  const written = applyEdit(html, { index }, { kind: 'styles', declarations })
  if (!written.ok) return written
  spans.push(written.span)
  return { ok: true, html: written.html, spans }
}
