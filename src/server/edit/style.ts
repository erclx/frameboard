import { shorthandPart } from '@/server/checks/cascade'

/**
 * The longhands a shorthand write drops, so a later one cannot keep overriding
 * the value just set.
 */
const BORDER_SIDES = ['top', 'right', 'bottom', 'left'] as const
const BORDER_PARTS = ['color', 'style', 'width'] as const

const SHORTHAND_LONGHANDS: Readonly<Record<string, readonly string[]>> = {
  background: [
    'background-attachment',
    'background-clip',
    'background-color',
    'background-image',
    'background-origin',
    'background-position',
    'background-repeat',
    'background-size',
  ],
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

/** The paint longhands whose part of a shorthand the inspector reads, and that shorthand. */
const PART_SHORTHANDS: Readonly<Record<string, string>> = {
  'background-color': 'background',
  'border-color': 'border',
  'border-width': 'border',
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
 * Splits a raw style at top-level semicolons, keeping each segment's spacing,
 * never at a character reference's own `;`.
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

/**
 * The part of a decoded style's last shorthand that a paint longhand or a
 * padding side reads from, which `setDeclaration` writes in place of the
 * longhand. Undefined for a property with no such shorthand, or a shorthand
 * holding no such part.
 */
export function shorthandValue(
  style: string,
  property: string,
): string | undefined {
  const side = PADDING_LONGHANDS.indexOf(property)
  if (side >= 0) {
    const padding = declaredValues(style, 'padding').at(-1)
    return padding === undefined ? undefined : paddingSides(padding)?.[side]
  }
  const shorthand = PART_SHORTHANDS[property]
  if (!shorthand) return undefined
  const value = declaredValues(style, shorthand).at(-1)
  return value === undefined ? undefined : shorthandPart(value, property)?.text
}

export type DeclarationResult =
  | { readonly ok: true; readonly style: string }
  | { readonly ok: false }

/**
 * Sets or drops one declaration, dropping later ones so nothing overrides the
 * edit, and refusing a style ending inside an open quote or comment. A padding
 * side folds the inline padding into one `padding` once all four are declared.
 */
export function setDeclaration(
  style: string,
  property: string,
  value: string,
): DeclarationResult {
  const written = writeDeclaration(style, property, value)
  return written.ok && PADDING_LONGHANDS.includes(property)
    ? { ok: true, style: foldPadding(written.style) }
    : written
}

function writeDeclaration(
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

  const rewritten = withShorthandPart(segments, property, value.trim())
  if (rewritten !== null) return { ok: true, style: rewritten }

  if (!segments.some((segment) => propertyOf(segment) === property)) {
    // Drops empty segments, since an entity's own `;` can end a value.
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

const PADDING_LONGHANDS: readonly string[] = SHORTHAND_LONGHANDS.padding ?? []

/**
 * A length or percentage `padding` accepts, so a fold never puts a value one
 * side would drop into a shorthand, where it would drop all four.
 */
const PADDING_LENGTH =
  /^(?:0|(?:\d+\.?\d*|\.\d+)(?:%|px|r?em|r?lh|r?ex|r?ch|r?cap|r?ic|[sld]?v(?:w|h|i|b|min|max)|cq(?:w|h|i|b|min|max)|pt|pc|cm|mm|q|in))$/i

/** The top, right, bottom, and left a padding shorthand sets, if each is a plain length. */
function paddingSides(value: string): string[] | undefined {
  const parts = value.trim().split(/\s+/)
  if (parts.length > 4 || !parts.every((part) => PADDING_LENGTH.test(part))) {
    return undefined
  }
  const [top = '', right = top, bottom = top, left = right] = parts
  return [top, right, bottom, left]
}

function paddingShorthand([
  top,
  right,
  bottom,
  left,
]: readonly string[]): string {
  if (left !== right) return `${top} ${right} ${bottom} ${left}`
  if (bottom !== top) return `${top} ${right} ${bottom}`
  return right === top ? `${top}` : `${top} ${right}`
}

/**
 * Folds a style's padding declarations into one `padding` once all four sides
 * are declared inline, since the shorthand then overrides nothing a sheet sets.
 * Leaves the style as written where a side cannot be read, as behind `!important`
 * or a comment, or where a logical side or a later shorthand would disagree.
 */
function foldPadding(style: string): string {
  const { segments } = declarations(style)
  const sides: (string | undefined)[] = [
    undefined,
    undefined,
    undefined,
    undefined,
  ]
  const at: number[] = []
  for (const [index, segment] of segments.entries()) {
    const property = propertyOf(segment)
    if (!property.startsWith('padding')) continue
    if (segment.includes('/*')) return style
    const value = segment.slice(segment.indexOf(':') + 1)
    if (property === 'padding') {
      const all = paddingSides(value)
      if (!all || at.length > 0) return style
      sides.splice(0, 4, ...all)
    } else {
      const side = PADDING_LONGHANDS.indexOf(property)
      if (side < 0 || !PADDING_LENGTH.test(value.trim())) return style
      sides[side] = value.trim()
    }
    at.push(index)
  }
  const [first] = at
  const known = sides.filter((side) => side !== undefined)
  if (first === undefined || at.length < 2 || known.length < 4) return style
  const lead = /^\s*/.exec(segments[first] ?? '')?.[0] ?? ''
  return segments
    .flatMap((segment, index) => {
      if (index === first) return [`${lead}padding: ${paddingShorthand(known)}`]
      return at.includes(index) ? [] : [segment]
    })
    .join(';')
}

/**
 * The segments with `value` in the last shorthand's part, so a paint edit
 * leaves no dead token behind, null when a later declaration would still win.
 */
function withShorthandPart(
  segments: readonly string[],
  property: string,
  value: string,
): string | null {
  const shorthand = PART_SHORTHANDS[property]
  if (!shorthand) return null
  const at = segments.findLastIndex(
    (segment) => propertyOf(segment) === shorthand,
  )
  const segment = segments[at]
  if (segment === undefined || segment.includes('/*')) return null
  if (
    segments
      .slice(at + 1)
      .some((later) => setsPart(propertyOf(later), property))
  ) {
    return null
  }
  const colon = segment.indexOf(':')
  const part = shorthandPart(segment.slice(colon + 1), property)
  if (!part) return null
  const from = colon + 1 + part.start
  const rewritten =
    segment.slice(0, from) + value + segment.slice(from + part.text.length)
  return segments
    .flatMap((each, index) => {
      if (index === at) return [rewritten]
      return index < at && propertyOf(each) === property ? [] : [each]
    })
    .join(';')
    .replace(/^\s+/, '')
}

const BORDER_SIDE =
  /^border-(?:top|right|bottom|left|block|inline)(?:-(?:start|end))?(?:-(color|width|style))?$/

/**
 * Whether a declaration of `declared` sets the part `property` names on any
 * side, as `border-top` or `border-top-width` does for `border-width`.
 */
function setsPart(declared: string, property: string): boolean {
  if (declared === property) return true
  const side = BORDER_SIDE.exec(declared)
  if (!side || !property.startsWith('border-')) return false
  return side[1] === undefined || `border-${side[1]}` === property
}

/**
 * Rewrites each declaration's value, keeping one with a comment as written,
 * since its `:` may sit inside the comment.
 */
export function rewriteValues(
  style: string,
  rewrite: (property: string, value: string) => string,
): string | null {
  const parsed = declarations(style)
  if (parsed.isOpen) return null
  return parsed.segments
    .map((segment) => {
      const colon = segment.indexOf(':')
      if (colon < 0 || segment.includes('/*')) return segment
      return (
        segment.slice(0, colon + 1) +
        rewrite(propertyOf(segment), segment.slice(colon + 1))
      )
    })
    .join(';')
}
