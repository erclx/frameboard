import type { Element } from 'domhandler'
import postcss from 'postcss'

import { buildCascade, splitTopLevel } from '@/server/checks/cascade'
import type { FrameSource, Sheet } from '@/server/checks/frame-source'
import type {
  ElementStyles,
  FrameStyles,
  StyleValue,
} from '@/shared/records/elements'

/** What the inspector reads, with the shorthands that set it. */
const PROPERTIES: ReadonlySet<string> = new Set([
  'color',
  'background-color',
  'background',
  'border-color',
  'border-width',
  'border',
  'box-shadow',
  'font-family',
  'font',
])

/** The colors Selection colors lists, each a property every element may set. */
const COLOR_PROPERTIES = ['color', 'background-color', 'border-color'] as const

/** Values that paint no color of their own, so Selection colors leaves them out. */
const NO_COLOR = new Set(['transparent', 'currentcolor', 'none'])

/** Words of a `border` or `background` shorthand that are never its color. */
const NOT_COLOR = new Set([
  'none',
  'hidden',
  'dotted',
  'dashed',
  'solid',
  'double',
  'groove',
  'ridge',
  'inset',
  'outset',
  'thin',
  'medium',
  'thick',
  'repeat',
  'no-repeat',
  'repeat-x',
  'repeat-y',
  'space',
  'round',
  'fixed',
  'scroll',
  'local',
  'center',
  'top',
  'bottom',
  'left',
  'right',
  'cover',
  'contain',
  'auto',
  'border-box',
  'padding-box',
  'content-box',
])

const VAR = /^var\(\s*(--[\w-]+)\s*(?:,.*)?\)$/is
const MIX =
  /^color-mix\(\s*in\s+srgb\s*,\s*var\(\s*(--[\w-]+)\s*(?:,[^)]*)?\)\s+([\d.]+)%\s*,\s*transparent\s*\)$/is
const HEX_ALPHA = /^#([0-9a-f]{6})([0-9a-f]{2})$/i

/**
 * A frame's colors as its source states them, read through the static
 * cascade the checks use, so a `var()` over a name a token sheet declares
 * is named exactly, one over a name only the frame declares answers the
 * value it resolves to, and a raw
 * value is answered raw rather than matched to a token that happens to
 * share its value. `index` is the edit address's, naming the selected
 * element, whose subtree the colors then cover in place of the frame's.
 */
export function frameStyles(
  source: FrameSource,
  tokens: Sheet[],
  index?: number,
): Pick<FrameStyles, 'element' | 'colors'> {
  const cascade = buildCascade(source, tokens, { properties: PROPERTIES })
  const tokenNames = declaredNames(tokens)
  const target = index === undefined ? undefined : source.elements[index]
  // A name only the frame declares is no token, so it answers as the value it
  // resolves to. A name nothing declares stays named for `unknown-token`.
  const named = (written: string, element: Element): StyleValue => {
    const value = styleValue(written)
    if (!value.token || tokenNames.has(value.token)) return value
    const resolved = cascade.resolve(`var(${value.token})`, element)
    if (resolved === null) return value
    const raw = styleValue(resolved)
    return { ...raw, percent: Math.round((raw.percent * value.percent) / 100) }
  }
  const read = (element: Element, property: string): StyleValue | null => {
    const found = cascade.specified(element, property)
    if (!found) return null
    const part = found.shorthand
      ? shorthandPart(found.value, property)
      : found.value
    return part === null ? null : named(part, found.element)
  }
  // A `font` shorthand states more than the family, so it names no token here.
  const family = (element: Element): StyleValue | null => {
    const found = cascade.specified(element, 'font-family')
    if (!found || found.userAgent || found.shorthand) return null
    return styleValue(found.value)
  }

  const element: ElementStyles | null = target
    ? {
        color: read(target, 'color'),
        backgroundColor: read(target, 'background-color'),
        borderColor: read(target, 'border-color'),
        borderWidth: read(target, 'border-width'),
        boxShadow: read(target, 'box-shadow'),
        fontFamily: family(target),
      }
    : null

  const root =
    target ?? source.elements.find((candidate) => candidate.name === 'body')
  const subtree = root
    ? source.elements.filter((candidate) => within(candidate, root))
    : source.elements
  const colors = new Map<string, StyleValue>()
  for (const candidate of subtree) {
    for (const property of COLOR_PROPERTIES) {
      const value = read(candidate, property)
      if (!value || NO_COLOR.has(value.value.trim().toLowerCase())) continue
      const key = `${value.token ?? value.value.toLowerCase()}:${value.percent}`
      if (!colors.has(key)) colors.set(key, value)
    }
  }
  return { element, colors: [...colors.values()] }
}

/** A stated value with the token it names and the percent it keeps. */
export function styleValue(written: string): StyleValue {
  const value = written.trim()
  const token = VAR.exec(value)?.[1]
  if (token) return { value, token, percent: 100 }
  const mix = MIX.exec(value)
  if (mix?.[1] && mix[2]) {
    return { value, token: mix[1], percent: Number(mix[2]) }
  }
  const alpha = HEX_ALPHA.exec(value)
  if (alpha?.[1] && alpha[2]) {
    return {
      value: `#${alpha[1]}`,
      token: null,
      percent: Math.round((parseInt(alpha[2], 16) / 255) * 100),
    }
  }
  return { value, token: null, percent: 100 }
}

/** The custom properties the token sheets declare, which alone are tokens. */
function declaredNames(sheets: Sheet[]): Set<string> {
  const names = new Set<string>()
  for (const sheet of sheets) {
    try {
      postcss.parse(sheet.css).walkDecls(/^--/, (node) => {
        names.add(node.prop)
      })
    } catch {
      continue
    }
  }
  return names
}

/**
 * The part of a `border` or `background` shorthand that sets `property`:
 * the last part that reads as a color for a color, since a color comes last
 * in a border, and the first length for a width. Null when none does.
 */
function shorthandPart(value: string, property: string): string | null {
  const parts = splitTopLevel(value.trim(), ' ').filter((part) => part !== '')
  if (property === 'border-width') {
    return (
      parts.find((part) => /^(?:[\d.]|thin|medium|thick)/i.test(part)) ?? null
    )
  }
  return parts.findLast(isColorish) ?? null
}

function isColorish(part: string): boolean {
  const lower = part.toLowerCase()
  if (NOT_COLOR.has(lower)) return false
  if (/^[\d.+-]/.test(lower) || lower.includes('/')) return false
  return !/^(?:url|[a-z-]*gradient|image-set)\(/.test(lower)
}

function within(element: Element, root: Element): boolean {
  for (let current: Element | null = element; current;) {
    if (current === root) return true
    const parent: Element['parent'] = current.parent
    current = parent && parent.type === 'tag' ? (parent as Element) : null
  }
  return false
}
