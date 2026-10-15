import type { Element } from './address'

/** Elements whose content the tokenizer reads as raw text, not as a text node to splice. */
const RAW_TEXT = new Set(['script', 'style', 'template', 'textarea', 'title'])

/** Elements whose text the tree builder moves elsewhere, so a write never lands inside them. */
const RELOCATING = new Set([
  'html',
  'head',
  'table',
  'thead',
  'tbody',
  'tfoot',
  'tr',
  'colgroup',
  'select',
  'frameset',
])

/** The parser drops one leading newline inside these. */
const LEADING_NEWLINE_DROPPED = new Set(['pre', 'listing'])

export type TextResult =
  | { readonly ok: true; readonly html: string }
  | { readonly ok: false; readonly detail: string }

export function escapeText(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
}

/**
 * Replaces the text of an element holding text alone. The source between its
 * tags must be exactly its one text node, or nothing, since misnested markup
 * such as `<b>1<p>2</b>` leaves the element's end tag past markup the tree
 * builder gave to another element.
 */
export function setText(
  source: string,
  element: Element,
  value: string,
): TextResult {
  const tag = element.tagName
  const location = element.sourceCodeLocation
  if (RAW_TEXT.has(tag)) {
    return { ok: false, detail: `<${tag}> holds raw content, not text` }
  }
  if (RELOCATING.has(tag)) {
    return {
      ok: false,
      detail: `the parser moves text written inside <${tag}>`,
    }
  }
  if (!location?.startTag || !location.endTag) {
    return { ok: false, detail: `<${tag}> has no end tag to bound its text` }
  }
  const from = location.startTag.endOffset
  const to = location.endTag.startOffset
  const [only, ...rest] = element.childNodes
  const isTiled =
    only === undefined
      ? from === to
      : rest.length === 0 &&
        only.nodeName === '#text' &&
        only.sourceCodeLocation?.startOffset === from &&
        only.sourceCodeLocation.endOffset === to
  if (!isTiled) {
    return { ok: false, detail: `<${tag}> holds more than one text node` }
  }
  const written =
    LEADING_NEWLINE_DROPPED.has(tag) && value.startsWith('\n')
      ? `\n${value}`
      : value
  return {
    ok: true,
    html: source.slice(0, from) + escapeText(written) + source.slice(to),
  }
}
