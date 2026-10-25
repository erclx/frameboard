import { type Element, type FrameTree, parseFrame } from './address'

/**
 * Which bytes of an element a hand edit's undo holds: the start tag for a
 * style or attribute edit, and the whole element for a text edit, so a class
 * or text an agent changed on that element since refuses the undo.
 */
export type SpanScope = 'start-tag' | 'element'

/** The edited element's bytes before and after a hand edit, and where it was last found. */
export interface ElementSpan {
  readonly scope: SpanScope
  /** The element's position in `querySelectorAll('*')` order. */
  readonly index: number
  /** How many elements the frame held, which keeps `index` trusted while unchanged. */
  readonly count: number
  readonly before: string
  readonly after: string
}

export type SpanSide = 'before' | 'after'

export interface SwappedSpan {
  readonly html: string
  /** The span as it now stands, at the index it was found. */
  readonly span: ElementSpan
}

const OTHER: Record<SpanSide, SpanSide> = { before: 'after', after: 'before' }

/** The source range a scope covers on a stated element, or undefined for an implied one. */
function rangeOf(
  element: Element,
  scope: SpanScope,
): [number, number] | undefined {
  const location = element.sourceCodeLocation
  if (!location?.startTag) return undefined
  return scope === 'start-tag'
    ? [location.startTag.startOffset, location.startTag.endOffset]
    : [location.startOffset, location.endOffset]
}

/** The bytes of one element a scope covers, as `ElementSpan` records them. */
export function spanText(
  source: string,
  element: Element,
  scope: SpanScope,
): string {
  const range = rangeOf(element, scope)
  return range ? source.slice(...range) : ''
}

interface Found {
  readonly index: number
  readonly range: [number, number]
}

function matches(
  source: string,
  element: Element | undefined,
  scope: SpanScope,
  text: string,
): [number, number] | undefined {
  const range = element && rangeOf(element, scope)
  return range && source.slice(...range) === text ? range : undefined
}

/**
 * The element reading `span[side]`: the one at the recorded index while the
 * element count is unchanged, else the one element whose bytes match, else
 * none, since guessing between two would write over the wrong one.
 */
function locate(
  source: string,
  tree: FrameTree,
  span: ElementSpan,
  side: SpanSide,
): Found | undefined {
  const text = span[side]
  if (tree.elements.length === span.count) {
    const range = matches(source, tree.elements[span.index], span.scope, text)
    return range && { index: span.index, range }
  }
  const found = tree.elements.flatMap((element, index) => {
    const range = matches(source, element, span.scope, text)
    return range ? [{ index, range }] : []
  })
  return found.length === 1 ? found[0] : undefined
}

/** Whether the frame still holds the edited element as `side` of the edit left it. */
export function holdsSpan(
  source: string,
  span: ElementSpan,
  side: SpanSide,
): boolean {
  return locate(source, parseFrame(source), span, side) !== undefined
}

/**
 * Finds the element reading `side` of the span and writes the other side in
 * its place, leaving every other byte as it stands. Answers undefined when the
 * element is not found, or when the swap would leave it unfound, as a write
 * the parser reads across element bounds would.
 */
export function swapSpan(
  source: string,
  span: ElementSpan,
  side: SpanSide,
): SwappedSpan | undefined {
  const tree = parseFrame(source)
  const found = locate(source, tree, span, side)
  if (!found) return undefined
  const [start, end] = found.range
  const html = source.slice(0, start) + span[OTHER[side]] + source.slice(end)
  const moved = { ...span, index: found.index, count: tree.elements.length }
  const written = parseFrame(html)
  if (
    written.elements.length !== moved.count ||
    !matches(html, written.elements[moved.index], span.scope, span[OTHER[side]])
  ) {
    return undefined
  }
  return { html, span: moved }
}
