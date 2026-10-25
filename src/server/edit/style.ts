/**
 * The longhands a shorthand write drops, so a later longhand in the attribute
 * does not keep overriding the value just set. A longhand write leaves its
 * shorthand alone, since the longhand comes later and already wins.
 */
const BORDER_SIDES = ['top', 'right', 'bottom', 'left'] as const
const BORDER_PARTS = ['color', 'style', 'width'] as const

const SHORTHAND_LONGHANDS: Readonly<Record<string, readonly string[]>> = {
  border: [
    ...BORDER_PARTS.map((part) => `border-${part}`),
    ...BORDER_SIDES.flatMap((side) => [
      `border-${side}`,
      ...BORDER_PARTS.map((part) => `border-${side}-${part}`),
    ]),
  ],
  'border-radius': [
    'border-top-left-radius',
    'border-top-right-radius',
    'border-bottom-right-radius',
    'border-bottom-left-radius',
  ],
  padding: ['padding-top', 'padding-right', 'padding-bottom', 'padding-left'],
}

const CHARACTER_REFERENCE = /&(?:#\d+|#x[0-9a-f]+|[a-z][a-z0-9]*);/iy
const DOUBLE_QUOTE_REFERENCES = new Set(['&quot;', '&#34;', '&#x22;'])
const SINGLE_QUOTE_REFERENCES = new Set(['&apos;', '&#39;', '&#x27;'])

interface Declarations {
  readonly segments: readonly string[]
  /** The style ends inside a quote or a comment, so anything appended would be swallowed by it. */
  readonly isOpen: boolean
}

/** The end of the character reference starting at an offset, or undefined. */
function referenceEnd(style: string, at: number): number | undefined {
  if (style[at] !== '&') return undefined
  CHARACTER_REFERENCE.lastIndex = at
  return CHARACTER_REFERENCE.test(style)
    ? CHARACTER_REFERENCE.lastIndex
    : undefined
}

/**
 * Splits a raw, still-encoded style value at each semicolon outside
 * parentheses, quotes, and comments, keeping every segment's own spacing so
 * an untouched one is written back as it was. A character reference's own
 * semicolon never splits, a quote written as one is still a quote to CSS once
 * decoded, and a backslash escapes the character after it, so `'a\'` leaves
 * the quote open.
 */
function declarations(style: string): Declarations {
  const segments: string[] = []
  let depth = 0
  let quote: string | undefined
  let isComment = false
  let start = 0
  for (let at = 0; at < style.length; at += 1) {
    const char = style[at]
    if (isComment) {
      if (style.startsWith('*/', at)) {
        isComment = false
        at += 1
      }
      continue
    }
    if (char === '\\') {
      at = (referenceEnd(style, at + 1) ?? at + 2) - 1
      continue
    }
    const end = referenceEnd(style, at)
    if (end !== undefined) {
      const reference = style.slice(at, end).toLowerCase()
      at = end - 1
      const referenced = DOUBLE_QUOTE_REFERENCES.has(reference)
        ? '"'
        : SINGLE_QUOTE_REFERENCES.has(reference)
          ? "'"
          : undefined
      if (referenced && quote === referenced) quote = undefined
      else if (referenced && !quote) quote = referenced
    } else if (quote) {
      if (char === quote) quote = undefined
    } else if (style.startsWith('/*', at)) {
      isComment = true
      at += 1
    } else if (char === '"' || char === "'") quote = char
    else if (char === '(') depth += 1
    else if (char === ')') depth = Math.max(0, depth - 1)
    else if (char === ';' && depth === 0) {
      segments.push(style.slice(start, at))
      start = at + 1
    }
  }
  segments.push(style.slice(start))
  return { segments, isOpen: quote !== undefined || isComment }
}

/** The property a declaration names, read past any comment ahead of it. */
function propertyOf(segment: string): string {
  return (
    segment
      .replace(/\/\*[\s\S]*?\*\//g, '')
      .split(':', 1)[0]
      ?.trim()
      .toLowerCase() ?? ''
  )
}

/** The values a style declares for one property, in order, read from a decoded style. */
export function declaredValues(style: string, property: string): string[] {
  return declarations(style)
    .segments.filter((segment) => propertyOf(segment) === property)
    .map((segment) => segment.slice(segment.indexOf(':') + 1).trim())
}

export type DeclarationResult =
  | { readonly ok: true; readonly style: string }
  | { readonly ok: false }

/**
 * Sets one declaration in a raw style value, or drops it on an empty value.
 * The first declaration of the property is replaced in place and any later one
 * dropped, so nothing further in the attribute overrides the edit, and a
 * shorthand also drops its longhands. The value arrives already escaped for
 * the attribute. An empty style means none is left. A style ending inside an
 * open quote or comment refuses, since an appended declaration would land in it.
 */
export function setDeclaration(
  style: string,
  property: string,
  value: string,
): DeclarationResult {
  const parsed = declarations(style)
  if (parsed.isOpen) return { ok: false }
  const longhands = SHORTHAND_LONGHANDS[property] ?? []
  const segments = parsed.segments.filter(
    (segment) => !longhands.includes(propertyOf(segment)),
  )
  const declaration = `${property}: ${value.trim()}`

  if (value.trim() === '') {
    const kept = segments.filter((segment) => propertyOf(segment) !== property)
    if (kept.every((segment) => segment.trim() === '')) {
      return { ok: true, style: '' }
    }
    return { ok: true, style: kept.join(';').replace(/^[\s;]+/, '') }
  }

  if (!segments.some((segment) => propertyOf(segment) === property)) {
    // Drop empty segments rather than strip trailing `;` characters, since an
    // entity's own `;` ends a value such as `&quot;A&quot;`.
    const kept = segments
      .filter((segment) => segment.trim() !== '')
      .join(';')
      .replace(/^\s+/, '')
    return {
      ok: true,
      style: kept === '' ? declaration : `${kept}; ${declaration}`,
    }
  }

  let isReplaced = false
  const next = segments.flatMap((segment) => {
    if (propertyOf(segment) !== property) return [segment]
    if (isReplaced) return []
    isReplaced = true
    const lead = /^\s*/.exec(segment)?.[0] ?? ''
    return [`${lead}${declaration}`]
  })
  return { ok: true, style: next.join(';') }
}
