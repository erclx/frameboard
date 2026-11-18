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
 * Replaces a text-only element's text, or only the text node `run` names,
 * refusing source that does not tile, since misnesting can put an end tag
 * past another's markup.
 */
export function setText(
  source: string,
  element: Element,
  value: string,
  run?: number,
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
  if (run !== undefined) return setRun(source, element, value, run, from, to)
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
  return {
    ok: true,
    html:
      source.slice(0, from) +
      escapeText(guarded(tag, value)) +
      source.slice(to),
  }
}

/** A value starting right after the start tag, its leading newline doubled where the parser drops one. */
function guarded(tag: string, value: string): string {
  return LEADING_NEWLINE_DROPPED.has(tag) && value.startsWith('\n')
    ? `\n${value}`
    : value
}

/**
 * Splices one text node's source span, refusing one whose span leaves the
 * element's content or overlaps a sibling, since its bytes would not tile.
 */
function setRun(
  source: string,
  element: Element,
  value: string,
  run: number,
  from: number,
  to: number,
): TextResult {
  const tag = element.tagName
  const nodes = element.childNodes
  const at = nodes.filter((node) => node.nodeName === '#text')[run]
  if (!at) return { ok: false, detail: `<${tag}> holds no text run ${run}` }
  const position = nodes.indexOf(at)
  const start = at.sourceCodeLocation?.startOffset
  const end = at.sourceCodeLocation?.endOffset
  const previous = nodes[position - 1]?.sourceCodeLocation?.endOffset ?? from
  const next = nodes[position + 1]?.sourceCodeLocation?.startOffset ?? to
  if (
    start === undefined ||
    end === undefined ||
    start < previous ||
    end > next ||
    start < from ||
    end > to
  ) {
    return {
      ok: false,
      detail: `<${tag}>'s text run ${run} does not tile its source`,
    }
  }
  // Past a dropped newline the parser already reads one, so only a run at the tag doubles it.
  const written = start === from ? guarded(tag, value) : value
  return {
    ok: true,
    html: source.slice(0, start) + escapeText(written) + source.slice(end),
  }
}
