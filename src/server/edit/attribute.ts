import type { Element } from './address'
import { scanStartTag } from './start-tag'

interface Span {
  readonly startOffset: number
  readonly endOffset: number
}

interface ValueSpan {
  readonly start: number
  readonly end: number
  readonly quote: '"' | "'" | undefined
  /** The attribute states a name with no `=` and no value. */
  readonly isBare: boolean
}

/** Escapes a value for a double-quoted attribute. */
export function escapeAttribute(value: string): string {
  return value.replace(/&/g, '&amp;').replace(/"/g, '&quot;')
}

function splice(
  source: string,
  start: number,
  end: number,
  insert: string,
): string {
  return source.slice(0, start) + insert + source.slice(end)
}

/** The value inside one attribute's source span, without its quotes. */
function valueSpan(source: string, span: Span): ValueSpan {
  const text = source.slice(span.startOffset, span.endOffset)
  const equals = text.indexOf('=')
  if (equals === -1) {
    return {
      start: span.endOffset,
      end: span.endOffset,
      quote: undefined,
      isBare: true,
    }
  }
  let at = equals + 1
  while (/\s/.test(text[at] ?? '')) at += 1
  const opener = text[at]
  const quote = opener === '"' || opener === "'" ? opener : undefined
  return {
    start: span.startOffset + at + (quote ? 1 : 0),
    end: span.endOffset - (quote ? 1 : 0),
    quote,
    isBare: false,
  }
}

function attributeSpan(element: Element, name: string): Span | undefined {
  return element.sourceCodeLocation?.attrs?.[name]
}

/** The attribute's value as the file states it, still encoded, or undefined when it is absent. */
export function rawAttribute(
  source: string,
  element: Element,
  name: string,
): string | undefined {
  const span = attributeSpan(element, name)
  if (!span) return undefined
  const value = valueSpan(source, span)
  return source.slice(value.start, value.end)
}

/**
 * Sets one attribute to a raw value already escaped for double quotes,
 * splicing only inside its value span. An absent attribute goes in before the
 * tag's `>`, or before its real self-closing `/`, which only the start-tag
 * scan tells apart from a `/` ending an unquoted value.
 */
export function setRawAttribute(
  source: string,
  element: Element,
  name: string,
  raw: string,
): string {
  const span = attributeSpan(element, name)
  if (span) {
    const value = valueSpan(source, span)
    if (value.isBare)
      return splice(source, span.endOffset, span.endOffset, `="${raw}"`)
    if (value.quote === "'") {
      return splice(source, value.start, value.end, raw.replace(/'/g, '&#39;'))
    }
    if (value.quote === '"') return splice(source, value.start, value.end, raw)
    // An unquoted value is quoted on write, and a `"` it held is now inside quotes.
    return splice(
      source,
      value.start,
      value.end,
      `"${raw.replace(/"/g, '&quot;')}"`,
    )
  }
  const startTag = element.sourceCodeLocation?.startTag
  if (!startTag) return source
  const at = scanStartTag(source, startTag).slash ?? startTag.endOffset - 1
  const lead = /\s/.test(source[at - 1] ?? '') ? '' : ' '
  const trail = source[at] === '/' ? ' ' : ''
  return splice(source, at, at, `${lead}${name}="${raw}"${trail}`)
}

/**
 * Removes one attribute and the whitespace run ahead of it. A later duplicate
 * would come into force once the first is gone, so the first is emptied
 * instead, and a bare one is left as it is, already empty.
 */
export function removeAttribute(
  source: string,
  element: Element,
  name: string,
): string {
  const span = attributeSpan(element, name)
  const startTag = element.sourceCodeLocation?.startTag
  if (!span || !startTag) return source
  const { names } = scanStartTag(source, startTag)
  if (names.filter((stated) => stated === name).length > 1) {
    return valueSpan(source, span).isBare
      ? source
      : setRawAttribute(source, element, name, '')
  }
  let start = span.startOffset
  while (/\s/.test(source[start - 1] ?? '')) start -= 1
  return splice(source, start, span.endOffset, '')
}
