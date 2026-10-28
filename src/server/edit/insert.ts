import {
  type DefaultTreeAdapterTypes,
  html,
  parseFragment,
  serialize,
} from 'parse5'

import type { TokenRow } from '@/shared/records/tokens'
import { STARTER_FONTS } from '@/shared/starter-tokens'

import { type Element, type FrameTree, hasTag, parseFrame } from './address'
import { type EditRefused, refuse } from './apply'
import { spanText } from './element-span'

/** What a placement tool writes, as `POST /api/frames/insert` names it. */
export type InsertKind =
  | { readonly kind: 'text' }
  | ({ readonly kind: 'rectangle' } & ShapeSize)
  | ({ readonly kind: 'ellipse' } & ShapeSize)
  /** `vertical` draws the line down the left, as a divider in a row does. */
  | { readonly kind: 'divider'; readonly vertical: boolean }
  | ({ readonly kind: 'asset' } & PlacedAsset)

/**
 * A file under the project's `assets/`, shown as a `<video>` when `video`
 * and an `<img>` otherwise, at a size in CSS pixels.
 */
export interface PlacedAsset {
  /** Relative to the project's `assets/`, with `/` between segments. */
  readonly path: string
  readonly video: boolean
  readonly width: number
  readonly height: number
}

/** A shape's size in CSS pixels as a drag drew it, each side 100 when left out. */
export interface ShapeSize {
  readonly width?: number
  readonly height?: number
}

/** The colors a shape is painted in, each a `var()` of a token or a raw hex. */
export interface ShapePaint {
  readonly fill: string
  readonly line: string
}

/** The gap a new element goes into, as `querySelectorAll('*')` indices. */
export interface Placement {
  readonly parent: number
  /** The child element it goes before, or null for the parent's end. */
  readonly before: number | null
}

/** A stated element as an anchor reads it, by tag name and start tag bytes. */
export interface Anchor {
  readonly tagName: string
  /** The start tag's bytes, empty for an implied element. */
  readonly tag: string
}

/**
 * The element an insert wrote, which an undo takes out by its bytes and a
 * redo puts back under its parent, before the sibling it went before.
 */
export interface InsertedSpan {
  /** The whole element's bytes. */
  readonly markup: string
  /** Its index while it stands. */
  readonly index: number
  /** How many elements the frame holds while it stands, which keeps `index` trusted while unchanged. */
  readonly count: number
  /** The gap it goes into, in the frame without it. */
  readonly placement: Placement
  readonly parent: Anchor
  /** The start tag of the sibling it goes before, or null at the parent's end. */
  readonly next: string | null
  /** The bytes between its end and that gap, empty for a placed element. */
  readonly lead: string
}

export type Inserted =
  | {
      readonly ok: true
      readonly html: string
      readonly index: number
      readonly span: InsertedSpan
    }
  | EditRefused

const SHAPE_SIZE = 100
const FILL_TOKENS = ['--muted', '--secondary', '--accent']
const LINE_TOKEN = '--border'
const TEXT_FONT_TOKEN = '--font-text'
/** Raw on purpose, so the check names it once the project sets no color token. */
const RAW_GREY = '#d9d9d9'

const PAINT_VALUE = /^(?:var\(--[\w-]+\)|#[0-9a-f]{6})$/i

/** Elements no new element can sit inside, by what the parser does with one there. */
const CLOSED = new Set([
  // No children at all.
  'area',
  'base',
  'br',
  'col',
  'embed',
  'hr',
  'img',
  'input',
  'link',
  'meta',
  'source',
  'track',
  'wbr',
  // Raw text, or a document of its own.
  'script',
  'style',
  'template',
  'textarea',
  'title',
  'noscript',
  'iframe',
  // Outside the page's flow.
  'html',
  'head',
])

/**
 * A shape's fill, being the first of the muted, secondary, and accent tokens
 * the project sets, else its first color token, and its line, being the
 * border token else that first color token. With no color token at all, both
 * are a raw grey.
 */
export function shapePaint(tokens: readonly TokenRow[]): ShapePaint {
  const names = new Set(tokens.map((row) => row.name))
  const firstColor = tokens.find((row) => row.group === 'color')?.name
  const paint = (name: string | undefined) =>
    name === undefined ? RAW_GREY : `var(${name})`
  return {
    fill: paint(FILL_TOKENS.find((name) => names.has(name)) ?? firstColor),
    line: paint(names.has(LINE_TOKEN) ? LINE_TOKEN : firstColor),
  }
}

/**
 * The family placed text sets, being the project's text font token, else
 * Geist, so a frame with no font of its own still passes `default-font`.
 */
export function textFont(tokens: readonly TokenRow[]): string {
  return tokens.some((row) => row.name === TEXT_FONT_TOKEN)
    ? `var(${TEXT_FONT_TOKEN})`
    : STARTER_FONTS.geist.stack
}

/** Every byte an insert of `element` writes, with its `data-name` and size. */
export function elementMarkup(
  element: InsertKind,
  paint: ShapePaint,
  font: string,
): string {
  const { fill, line } = paint
  if (!PAINT_VALUE.test(fill) || !PAINT_VALUE.test(line)) {
    throw new Error(`Unexpected shape paint ${fill} ${line}`)
  }
  const size = ({ width = SHAPE_SIZE, height = SHAPE_SIZE }: ShapeSize) => {
    if (!Number.isInteger(width) || !Number.isInteger(height)) {
      throw new Error(`Unexpected shape size ${width} ${height}`)
    }
    return `width: ${width}px; height: ${height}px`
  }
  const box = (shape: ShapeSize) => `${size(shape)}; background: ${fill}`
  switch (element.kind) {
    case 'text':
      return `<p data-name="Text" style="font-family: ${font}">Text</p>`
    case 'rectangle':
      return `<div data-name="Rectangle" style="${box(element)}"></div>`
    case 'ellipse':
      return `<div data-name="Ellipse" style="${box(element)}; border-radius: 50%"></div>`
    case 'divider': {
      const side = element.vertical ? 'border-left' : 'border-top'
      return `<hr data-name="Divider" style="align-self: stretch; margin: 0; border: 0; ${side}: 1px solid ${line}">`
    }
    case 'asset': {
      const name = attribute(element.path.split('/').at(-1) ?? element.path)
      // A crop rather than a squash once a corner drag changes the ratio.
      const style = `${size(element)}; object-fit: cover`
      return element.video
        ? `<video data-name="${name}" src="${assetLink(element.path)}" autoplay muted loop playsinline style="${style}"></video>`
        : `<img data-name="${name}" src="${assetLink(element.path)}" alt="" style="${style}">`
    }
  }
}

/**
 * The path a frame at `<project>/<page>/<frame>.html` links a project asset
 * by, each segment encoded, as the Assets tab's `linkPath` copies it.
 */
function assetLink(path: string): string {
  return `../assets/${path.split('/').map(encodeURIComponent).join('/')}`
}

/** `text` as a double-quoted attribute value holds it. */
function attribute(text: string): string {
  return text
    .replaceAll('&', '&amp;')
    .replaceAll('"', '&quot;')
    .replaceAll('<', '&lt;')
}

function startTag(source: string, element: Element): string {
  return spanText(source, element, 'start-tag')
}

function children(element: Element): Element[] {
  return element.childNodes.filter(hasTag)
}

/** The source offset the gap sits at, or a refusal when the file states none. */
function gapOffset(
  tree: FrameTree,
  placement: Placement,
): { parent: Element; offset: number } | EditRefused {
  if (tree.unstated) {
    return refuse(
      'address-mismatch',
      `the browser builds a <${tree.unstated.tagName}> the file does not state, so indices after it disagree`,
    )
  }
  const { elements } = tree
  const parent = Number.isInteger(placement.parent)
    ? elements[placement.parent]
    : undefined
  if (!parent) {
    return refuse(
      'invalid-address',
      `the frame holds elements 0 to ${elements.length - 1}, so ${placement.parent} names none`,
    )
  }
  if (parent.namespaceURI !== html.NS.HTML || CLOSED.has(parent.tagName)) {
    return refuse(
      'invalid-container',
      `<${parent.tagName}> cannot hold a placed element`,
    )
  }
  if (placement.before !== null) {
    const child = elements[placement.before]
    const at = child?.sourceCodeLocation
    if (!child || child.parentNode !== parent || !at?.startTag) {
      return refuse(
        'invalid-address',
        `${placement.before} names no stated child of the <${parent.tagName}> at ${placement.parent}`,
      )
    }
    return { parent, offset: at.startOffset }
  }
  const at = parent.sourceCodeLocation
  if (at?.endTag) return { parent, offset: at.endTag.startOffset }
  // With no end tag stated, the gap closes the last child, never one inside it.
  const last = parent.childNodes.findLast((node) => node.sourceCodeLocation)
  const offset = last?.sourceCodeLocation?.endOffset ?? at?.startTag?.endOffset
  if (offset === undefined) {
    return refuse(
      'address-mismatch',
      `the <${parent.tagName}> at ${placement.parent} states no place to put an element`,
    )
  }
  return { parent, offset }
}

/**
 * Writes `markup` into the gap and leaves every other byte as it was. The
 * output is parsed again and refused as `verify-failed` unless its tree is
 * the input's with that one element added under the parent, so a tag the
 * parser would move, as a `<div>` closing a `<p>`, is refused rather than
 * written somewhere else.
 *
 * A `lead` lands the element that many bytes ahead of the gap, once they
 * read as given, so an element put back lands where it stood and not past
 * the whitespace that followed it.
 */
export function insertElement(
  source: string,
  placement: Placement,
  markup: string,
  lead = '',
): Inserted {
  const before = parseFrame(source)
  const gap = gapOffset(before, placement)
  if ('ok' in gap) return gap
  const { parent } = gap
  const offset = gap.offset - lead.length
  if (offset < 0 || source.slice(offset, gap.offset) !== lead) {
    return refuse(
      'address-mismatch',
      `the bytes ahead of the gap in the <${parent.tagName}> at ${placement.parent} changed`,
    )
  }
  const written = source.slice(0, offset) + markup + source.slice(offset)

  const after = parseFrame(written)
  const index = after.elements.findIndex(
    (element) => element.sourceCodeLocation?.startOffset === offset,
  )
  const added = after.elements[index]
  if (
    !added ||
    after.elements.length !== before.elements.length + 1 + descendants(added) ||
    added.parentNode !== after.elements[placement.parent] ||
    spanText(written, added, 'element') !== markup ||
    !addsOnly(before, after, added)
  ) {
    return refuse(
      'verify-failed',
      `a <${added?.tagName ?? 'new element'}> there would change more than the <${parent.tagName}> it goes in, so nothing was written`,
    )
  }
  const next = children(parent).find(
    (child) => child.sourceCodeLocation?.startOffset === gap.offset,
  )
  return {
    ok: true,
    html: written,
    index,
    span: {
      markup,
      index,
      count: after.elements.length,
      placement,
      parent: { tagName: parent.tagName, tag: startTag(source, parent) },
      next: next ? startTag(source, next) : null,
      lead,
    },
  }
}

/** How many elements `element` holds, at any depth. */
function descendants(element: Element): number {
  return children(element).reduce(
    (count, child) => count + 1 + descendants(child),
    0,
  )
}

/** Whether `after` is `before` with `added` alone added, compared once it is taken out. */
function addsOnly(
  before: FrameTree,
  after: FrameTree,
  added: Element,
): boolean {
  const parent = added.parentNode as DefaultTreeAdapterTypes.ParentNode
  parent.childNodes = parent.childNodes.filter((node) => node !== added)
  return serialize(before.document) === serialize(after.document)
}

/**
 * The inserted element as it stands: the one at the recorded index while the
 * element count is unchanged, else the one element whose bytes match, else
 * none, since taking out one of two would guess.
 */
function locateInserted(
  source: string,
  tree: FrameTree,
  span: InsertedSpan,
): number | undefined {
  const reads = (element: Element | undefined) =>
    element !== undefined &&
    spanText(source, element, 'element') === span.markup
  if (tree.elements.length === span.count) {
    return reads(tree.elements[span.index]) ? span.index : undefined
  }
  const found = tree.elements.flatMap((element, index) =>
    reads(element) ? [index] : [],
  )
  return found.length === 1 ? found[0] : undefined
}

/** The gap the span goes back into, read off its anchors where the frame now stands. */
function locateGap(
  source: string,
  tree: FrameTree,
  span: InsertedSpan,
): Placement | undefined {
  const reads = (element: Element | undefined) =>
    element !== undefined &&
    element.tagName === span.parent.tagName &&
    startTag(source, element) === span.parent.tag
  // While every other element holds, the recorded indices still name the parent and the sibling.
  const held = tree.elements.length === span.count - markupSize(span.markup)
  const candidates =
    held && reads(tree.elements[span.placement.parent])
      ? [span.placement.parent]
      : tree.elements.flatMap((element, index) =>
          reads(element) ? [index] : [],
        )
  const parentIndex = candidates.length === 1 ? candidates[0] : undefined
  const parent =
    parentIndex === undefined ? undefined : tree.elements[parentIndex]
  if (parentIndex === undefined || !parent) return undefined
  if (span.next === null) return { parent: parentIndex, before: null }
  const recorded =
    span.placement.before === null
      ? undefined
      : tree.elements[span.placement.before]
  if (
    held &&
    recorded &&
    recorded.parentNode === parent &&
    startTag(source, recorded) === span.next
  ) {
    return { parent: parentIndex, before: span.placement.before }
  }
  const next = children(parent).filter(
    (child) => startTag(source, child) === span.next,
  )
  const [sibling] = next
  return next.length === 1 && sibling
    ? { parent: parentIndex, before: tree.elements.indexOf(sibling) }
    : undefined
}

/** How many elements `markup` holds, itself and everything inside it. */
function markupSize(markup: string): number {
  const count = (node: DefaultTreeAdapterTypes.ParentNode): number =>
    node.childNodes.reduce(
      (total, child) => total + (hasTag(child) ? 1 + count(child) : 0),
      0,
    )
  return count(parseFragment(markup))
}

/** Whether the frame stands as `side` of the insert left it, with the element or with its gap. */
export function holdsInserted(
  source: string,
  span: InsertedSpan,
  side: 'before' | 'after',
): boolean {
  const tree = parseFrame(source)
  return side === 'after'
    ? locateInserted(source, tree, span) !== undefined
    : locateGap(source, tree, span) !== undefined
}

/**
 * Takes the inserted element out by its bytes and answers the span as the
 * frame then stands, so a redo finds its gap. Answers undefined when the
 * element is not found, or when taking it out would change more than it.
 */
export function removeInserted(
  source: string,
  span: InsertedSpan,
): { html: string; span: InsertedSpan } | undefined {
  const tree = parseFrame(source)
  const index = locateInserted(source, tree, span)
  return index === undefined ? undefined : takeOut(source, tree, index)
}

/**
 * Takes the element at `index` out with its descendants and answers the span
 * that puts it back, holding the bytes that stood between it and its gap.
 * Answers undefined when the element is not stated, or when putting it back
 * would not give `source` again, since the removal then reached past it.
 */
function takeOut(
  source: string,
  tree: FrameTree,
  index: number,
): { html: string; span: InsertedSpan } | undefined {
  const element = tree.elements[index]
  const at = element?.sourceCodeLocation
  const parent = element?.parentNode
  if (!element || !at?.startTag || !parent || !hasTag(parent)) return undefined
  const removed = source.slice(0, at.startOffset) + source.slice(at.endOffset)
  const next = children(parent)[children(parent).indexOf(element) + 1]
  const placement = {
    parent: tree.elements.indexOf(parent),
    before: next ? index : null,
  }
  const gap = gapOffset(parseFrame(removed), placement)
  if ('ok' in gap || gap.offset < at.startOffset) return undefined
  const lead = removed.slice(at.startOffset, gap.offset)
  const markup = source.slice(at.startOffset, at.endOffset)
  const back = insertElement(removed, placement, markup, lead)
  if (!back.ok || back.html !== source) return undefined
  return { html: removed, span: back.span }
}

export type Removed =
  | { readonly ok: true; readonly html: string; readonly span: InsertedSpan }
  | EditRefused

/**
 * Takes out the element at `index`, with everything it holds, and answers
 * the span `restoreInserted` puts it back by, so a delete is an insert run
 * backwards. Only an element under `body` is taken, and the removal is
 * refused as `verify-failed` unless the result parses as the source with
 * that element alone gone, and its bytes go back as that one element.
 * Putting it back lands it
 * before the same sibling, so the whitespace around it may sit on its other
 * side.
 */
export function removeElement(source: string, index: number): Removed {
  const tree = parseFrame(source)
  if (tree.unstated) {
    return refuse(
      'address-mismatch',
      `the browser builds a <${tree.unstated.tagName}> the file does not state, so indices after it disagree`,
    )
  }
  const element = tree.elements[index]
  if (!element || !underBody(element)) {
    return refuse(
      'invalid-address',
      `${index} names no element under the frame's body`,
    )
  }
  const at = element.sourceCodeLocation
  const parent = element.parentNode
  if (!at || !parent || !hasTag(parent)) {
    return refuse(
      'address-mismatch',
      `the <${element.tagName}> at ${index} is not stated in the file`,
    )
  }
  const removed = source.slice(0, at.startOffset) + source.slice(at.endOffset)
  const next = children(parent)[children(parent).indexOf(element) + 1]
  const placement = {
    parent: tree.elements.indexOf(parent),
    before: next ? index : null,
  }
  const back = insertElement(
    removed,
    placement,
    source.slice(at.startOffset, at.endOffset),
  )
  parent.childNodes = parent.childNodes.filter((node) => node !== element)
  const removesOnly =
    serialize(tree.document) === serialize(parseFrame(removed).document)
  if (!back.ok || !removesOnly) {
    return refuse(
      'verify-failed',
      `taking out the <${element.tagName}> at ${index} would change more than it, so nothing was written`,
    )
  }
  // A delete whose undo could not find the gap again would read as an agent's write.
  if (!holdsInserted(removed, back.span, 'before')) {
    return refuse(
      'verify-failed',
      `the <${element.tagName}> at ${index} could not be put back once taken out, so nothing was written`,
    )
  }
  return { ok: true, html: removed, span: back.span }
}

function underBody(element: Element): boolean {
  for (
    let node = element.parentNode;
    node && hasTag(node);
    node = node.parentNode
  ) {
    if (node.tagName === 'body') return true
  }
  return false
}

/**
 * Writes the element back into its gap, found by the parent's and the next
 * sibling's start tags, and answers the span as it now stands. Answers
 * undefined when the gap is not found or the write is refused.
 */
export function restoreInserted(
  source: string,
  span: InsertedSpan,
): { html: string; span: InsertedSpan } | undefined {
  const placement = locateGap(source, parseFrame(source), span)
  if (!placement) return undefined
  const inserted = insertElement(source, placement, span.markup, span.lead)
  return inserted.ok ? { html: inserted.html, span: inserted.span } : undefined
}

/**
 * An element a move took out of one gap and wrote into another, held as two
 * inserted spans: `from` as it stood in its old gap, and `to` in its new one,
 * each read in the frame without it.
 */
export interface MovedSpan {
  readonly from: InsertedSpan
  readonly to: InsertedSpan
}

export type Moved =
  | {
      readonly ok: true
      readonly html: string
      /** The element's index in its new gap. */
      readonly index: number
      readonly span: MovedSpan
    }
  | EditRefused

/**
 * Takes the element at `index` out by its bytes and writes them into the gap
 * `placement` names, both read in the frame as it stands, leaving every other
 * byte. A gap in the element or under it is refused as `invalid-container`,
 * since the element would be written inside itself, and the gap it already
 * sits in as `invalid-address`. Each half is checked as `insertElement`
 * checks a placement, so a move the parser would rebuild is refused whole.
 */
export function moveElement(
  source: string,
  index: number,
  placement: Placement,
): Moved {
  const tree = parseFrame(source)
  const element = Number.isInteger(index) ? tree.elements[index] : undefined
  if (!element?.sourceCodeLocation?.startTag) {
    return refuse(
      'invalid-address',
      `${index} names no element the file states`,
    )
  }
  // The element and its descendants run on from `index` in document order.
  const end = index + 1 + descendants(element)
  const shift = (at: number) => (at < end ? at : at - (end - index))
  if (placement.parent >= index && placement.parent < end) {
    return refuse(
      'invalid-container',
      `the <${element.tagName}> at ${index} cannot go inside itself`,
    )
  }

  const taken = takeOut(source, tree, index)
  if (!taken) {
    return refuse(
      'verify-failed',
      `taking the <${element.tagName}> at ${index} out would change more than it, so nothing was written`,
    )
  }
  const target = {
    parent: shift(placement.parent),
    before: placement.before === null ? null : shift(placement.before),
  }
  // Read on the gaps, not the bytes, since whitespace after the element
  // would otherwise move ahead of it and read as a change.
  if (
    target.parent === taken.span.placement.parent &&
    target.before === taken.span.placement.before
  ) {
    return refuse(
      'invalid-address',
      `the <${element.tagName}> at ${index} already sits in that gap`,
    )
  }
  const moved = insertElement(taken.html, target, taken.span.markup)
  if (!moved.ok) return moved
  return {
    ok: true,
    html: moved.html,
    index: moved.index,
    span: { from: taken.span, to: moved.span },
  }
}

/**
 * Writes the moved element back to `side` of the move, taking it out of the
 * other gap by its bytes and into this one by its anchors, and answers the
 * span as the frame then stands. Answers undefined when either half is not
 * found, so a step the frame no longer allows is refused rather than guessed.
 */
export function relocateMoved(
  source: string,
  span: MovedSpan,
  side: 'before' | 'after',
): { html: string; span: MovedSpan } | undefined {
  const [leave, land] =
    side === 'before' ? [span.to, span.from] : [span.from, span.to]
  const removed = removeInserted(source, leave)
  const written = removed && restoreInserted(removed.html, land)
  if (!removed || !written) return undefined
  return {
    html: written.html,
    span:
      side === 'before'
        ? { from: written.span, to: removed.span }
        : { from: removed.span, to: written.span },
  }
}
