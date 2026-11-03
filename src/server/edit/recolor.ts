import { serialize } from 'parse5'

import { colorKey, styleValue } from '@/server/look/colors'

import { type Element, parseFrame } from './address'
import { type EditRefused, refuse } from './apply'
import { rawAttribute, setRawAttribute } from './attribute'
import { type ElementSpan, spanText } from './element-span'
import { rewriteValues } from './style'

/** A raw color Selection colors lists, and the token a replace writes in its place. */
export interface Recolor {
  /** The color as `frameStyles` answers it, its alpha split into the percent. */
  readonly from: { readonly value: string; readonly percent: number }
  /** The token's custom property, with its leading `--`. */
  readonly token: string
}

export type Recolored =
  | {
      readonly ok: true
      readonly html: string
      /** Each rewritten element's start tag, in document order, which one undo puts back together. */
      readonly spans: readonly ElementSpan[]
    }
  | EditRefused

/** The properties Selection colors reads, with the shorthands that set them. */
const COLOR_PROPERTIES: ReadonlySet<string> = new Set([
  'color',
  'background-color',
  'border-color',
  'background',
  'border',
])

/**
 * Writes the token in place of every inline declaration of `from` on the
 * element `root` names and its descendants, or on the frame's `body` and its
 * descendants when `root` is undefined. Only the color part of a `border` or
 * `background` shorthand changes, a value below 100 percent keeps its
 * percent as a `color-mix()` over the token, and a value a `<style>` rule
 * sets is never touched. The output is parsed again and refused as
 * `verify-failed` unless each changed element differs only in its style, by
 * exactly the swap, so a write never lands in part. An empty `spans` means
 * nothing in the subtree states the color inline.
 */
export function recolorElements(
  source: string,
  root: number | undefined,
  recolor: Recolor,
): Recolored {
  const before = parseFrame(source)
  if (before.unstated) {
    return refuse(
      'address-mismatch',
      `the browser builds a <${before.unstated.tagName}> the file does not state, so indices after it disagree`,
    )
  }
  const top =
    root === undefined
      ? before.elements.find((element) => element.tagName === 'body')
      : before.elements[root]
  if (!top) {
    return refuse(
      'invalid-address',
      `the frame holds elements 0 to ${before.elements.length - 1}, so ${root} names none`,
    )
  }

  const swap = swapper(recolor)
  const changes: { index: number; element: Element; style: string }[] = []
  for (const [index, element] of before.elements.entries()) {
    if (!within(element, top) || !element.sourceCodeLocation?.startTag) {
      continue
    }
    const style = rawAttribute(source, element, 'style')
    if (style === undefined) continue
    const next = rewriteValues(style, swap)
    if (next === null) {
      return refuse(
        'open-quote',
        `the style on <${element.tagName}> ends inside an open quote or comment`,
      )
    }
    if (next !== style) changes.push({ index, element, style: next })
  }
  if (changes.length === 0) return { ok: true, html: source, spans: [] }

  // From the last element back, so each write leaves the offsets before it as parsed.
  let html = source
  for (const { element, style } of changes.toReversed()) {
    html = setRawAttribute(html, element, 'style', style)
  }

  const after = parseFrame(html)
  if (!changesOnlyStyles(before, after, changes, swap)) {
    return refuse(
      'verify-failed',
      'the color replace would change more than the colors it names, so nothing was written',
    )
  }
  const spans = changes.map(({ index, element }): ElementSpan => {
    const now = after.elements[index]
    return {
      scope: 'start-tag',
      index,
      count: before.elements.length,
      before: spanText(source, element, 'start-tag'),
      after: now ? spanText(html, now, 'start-tag') : '',
    }
  })
  return { ok: true, html, spans }
}

/** Rewrites one declaration's value, swapping each top-level part that is the color. */
function swapper(
  recolor: Recolor,
): (property: string, value: string) => string {
  const key = colorKey({ ...recolor.from, token: null })
  const percent = Number(key.slice(key.lastIndexOf(':') + 1))
  const token = `var(${recolor.token})`
  const written =
    percent >= 100
      ? token
      : `color-mix(in srgb, ${token} ${percent}%, transparent)`
  return (property, value) =>
    COLOR_PROPERTIES.has(property)
      ? replaceParts(value, (part) =>
          colorKey(styleValue(part)) === key ? written : part,
        )
      : value
}

/**
 * Passes each part of a value separated by top-level whitespace through
 * `replace`, keeping the whitespace and any parenthesized group whole, so a
 * color inside `color-mix()` or `url()` is never read as a part.
 */
function replaceParts(
  value: string,
  replace: (part: string) => string,
): string {
  let out = ''
  let depth = 0
  let start = -1
  for (let at = 0; at < value.length; at += 1) {
    const char = value[at] ?? ''
    if (start < 0) {
      if (/\s/.test(char)) {
        out += char
        continue
      }
      start = at
    }
    if (char === '(') depth += 1
    else if (char === ')') depth = Math.max(0, depth - 1)
    const next = value[at + 1]
    if (depth === 0 && (next === undefined || /\s/.test(next))) {
      out += replace(value.slice(start, at + 1))
      start = -1
    }
  }
  return start < 0 ? out : out + value.slice(start)
}

/**
 * Whether the output's tree is the input's with each changed element's style
 * swapped and nothing else, its decoded style being exactly the swap of the
 * one it had. The changed styles are copied across before the trees are
 * compared, so the comparison covers every other node.
 */
function changesOnlyStyles(
  before: ReturnType<typeof parseFrame>,
  after: ReturnType<typeof parseFrame>,
  changes: readonly { index: number }[],
  swap: (property: string, value: string) => string,
): boolean {
  if (after.elements.length !== before.elements.length) return false
  for (const { index } of changes) {
    const was = before.elements[index]?.attrs.find(isStyle)
    const now = after.elements[index]?.attrs.find(isStyle)
    if (!was || !now || rewriteValues(was.value, swap) !== now.value) {
      return false
    }
    was.value = now.value
  }
  return serialize(before.document) === serialize(after.document)
}

function isStyle(attribute: { name: string }): boolean {
  return attribute.name === 'style'
}

function within(element: Element, root: Element): boolean {
  for (let node: Element['parentNode'] = element; node;) {
    if (node === root) return true
    node = 'parentNode' in node ? node.parentNode : null
  }
  return false
}
