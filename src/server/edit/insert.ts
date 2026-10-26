import { type DefaultTreeAdapterTypes, html, serialize } from 'parse5'

import type { TokenRow } from '@/shared/records/tokens'
import { STARTER_FONTS } from '@/shared/starter-tokens'

import { type Element, type FrameTree, hasTag, parseFrame } from './address'
import { type EditRefused, refuse } from './apply'
import { spanText } from './element-span'

/** What a placement tool writes, as `POST /api/frames/insert` names it. */
export type InsertKind =
  | { readonly kind: 'text' }
  | { readonly kind: 'rectangle' }
  | { readonly kind: 'ellipse' }
  /** `vertical` draws the line down the left, as a divider in a row does. */
  | { readonly kind: 'divider'; readonly vertical: boolean }

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
}

export type Inserted =
  | {
      readonly ok: true
      readonly html: string
      readonly index: number
      readonly span: InsertedSpan
    }
  | EditRefused

const SHAPE_SIZE = '100px'
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

/** Every byte an insert of `element` writes, with its `data-name` and default size. */
export function elementMarkup(
  element: InsertKind,
  paint: ShapePaint,
  font: string,
): string {
  const { fill, line } = paint
  if (!PAINT_VALUE.test(fill) || !PAINT_VALUE.test(line)) {
    throw new Error(`Unexpected shape paint ${fill} ${line}`)
  }
  const box = `width: ${SHAPE_SIZE}; height: ${SHAPE_SIZE}; background: ${fill}`
  switch (element.kind) {
    case 'text':
      return `<p data-name="Text" style="font-family: ${font}">Text</p>`
    case 'rectangle':
      return `<div data-name="Rectangle" style="${box}"></div>`
    case 'ellipse':
      return `<div data-name="Ellipse" style="${box}; border-radius: 50%"></div>`
    case 'divider': {
      const side = element.vertical ? 'border-left' : 'border-top'
      return `<hr data-name="Divider" style="align-self: stretch; margin: 0; border: 0; ${side}: 1px solid ${line}">`
    }
  }
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
 */
export function insertElement(
  source: string,
  placement: Placement,
  markup: string,
): Inserted {
  const before = parseFrame(source)
  const gap = gapOffset(before, placement)
  if ('ok' in gap) return gap
  const { parent, offset } = gap
  const written = source.slice(0, offset) + markup + source.slice(offset)

  const after = parseFrame(written)
  const index = after.elements.findIndex(
    (element) => element.sourceCodeLocation?.startOffset === offset,
  )
  const added = after.elements[index]
  if (
    !added ||
    after.elements.length !== before.elements.length + 1 ||
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
    (child) => child.sourceCodeLocation?.startOffset === offset,
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
    },
  }
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
  const held = tree.elements.length === span.count - 1
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
  const next = children(parent).filter(
    (child) => startTag(source, child) === span.next,
  )
  const [sibling] = next
  return next.length === 1 && sibling
    ? { parent: parentIndex, before: tree.elements.indexOf(sibling) }
    : undefined
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
  const element = index === undefined ? undefined : tree.elements[index]
  const at = element?.sourceCodeLocation
  const parent = element?.parentNode
  if (index === undefined || !at || !parent || !hasTag(parent)) return undefined
  const removed = source.slice(0, at.startOffset) + source.slice(at.endOffset)
  const next = children(parent)[children(parent).indexOf(element) + 1]
  const placement = {
    parent: tree.elements.indexOf(parent),
    before: next ? index : null,
  }
  // Putting it back has to give these bytes again, or the removal reached past it.
  const back = insertElement(removed, placement, span.markup)
  if (!back.ok || back.html !== source) return undefined
  return { html: removed, span: back.span }
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
  const inserted = insertElement(source, placement, span.markup)
  return inserted.ok ? { html: inserted.html, span: inserted.span } : undefined
}
