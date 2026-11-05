import type { Element } from 'domhandler'
import postcss from 'postcss'

import { buildCascade, splitTopLevel } from '@/server/checks/cascade'
import type { FrameSource, Sheet } from '@/server/checks/frame-source'
import type {
  ElementStyles,
  FrameStyles,
  StyleValue,
  UsedColor,
} from '@/shared/records/elements'

import { FLOW_PROPERTIES, flowOf } from './flow'

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
  // resolves to, or the token its chain reaches first. A name nothing
  // declares stays named for `unknown-token`.
  const named = (written: string, element: Element): StyleValue => {
    const value = styleValue(written)
    if (!value.token || tokenNames.has(value.token)) return value
    const resolved = cascade.resolve(`var(${value.token})`, element, tokenNames)
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
        flow: flowOf(
          buildCascade(source, tokens, { properties: FLOW_PROPERTIES }),
          target,
        ),
      }
    : null

  const root =
    target ?? source.elements.find((candidate) => candidate.name === 'body')
  const colors = new Map<string, UsedColor & { uses: number[] }>()
  source.elements.forEach((candidate, at) => {
    if (root && !within(candidate, root)) return
    for (const property of COLOR_PROPERTIES) {
      const value = read(candidate, property)
      if (!value || NO_COLOR.has(value.value.trim().toLowerCase())) continue
      const key = colorKey(value)
      const color = colors.get(key) ?? { ...value, uses: [] }
      colors.set(key, color)
      if (candidate.name !== 'body' && color.uses.at(-1) !== at) {
        color.uses.push(at)
      }
    }
  })
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

const SHORT_HEX = /^#([0-9a-f]{3,4})$/i
const LONG_HEX = /^#([0-9a-f]{6})$/i
const RGB =
  /^rgba?\(\s*([\d.]+)[\s,]+([\d.]+)[\s,]+([\d.]+)\s*(?:[,/]\s*([\d.]+%?)\s*)?\)$/i

/**
 * One color however the source writes it, so `#4F46E5`, `#4f46e5`, and
 * `rgb(79, 70, 229)` group as one Selection colors row and one color
 * replace reaches each. A token keys by its name, and an alpha
 * a raw value carries joins its percent.
 */
export function colorKey(value: StyleValue): string {
  if (value.token) return `${value.token}:${value.percent}`
  const raw = rawColor(value.value.trim())
  const percent = Math.round((raw.percent * value.percent) / 100)
  return `${raw.color}:${percent}`
}

function rawColor(written: string): { color: string; percent: number } {
  const short = SHORT_HEX.exec(written)?.[1]
  if (short) {
    const [r = '', g = '', b = '', a] = [...short.toLowerCase()]
    return {
      color: `#${r}${r}${g}${g}${b}${b}`,
      percent: a === undefined ? 100 : alphaPercent(parseInt(a + a, 16) / 255),
    }
  }
  if (LONG_HEX.test(written))
    return { color: written.toLowerCase(), percent: 100 }
  const rgb = RGB.exec(written)
  if (rgb?.[1] && rgb[2] && rgb[3]) {
    const channels = [rgb[1], rgb[2], rgb[3]].map((channel) =>
      Math.min(255, Math.round(Number(channel)))
        .toString(16)
        .padStart(2, '0'),
    )
    const alpha = rgb[4]
    const percent =
      alpha === undefined
        ? 100
        : alpha.endsWith('%')
          ? Math.round(Number(alpha.slice(0, -1)))
          : alphaPercent(Number(alpha))
    return { color: `#${channels.join('')}`, percent }
  }
  return { color: written.toLowerCase(), percent: 100 }
}

function alphaPercent(alpha: number): number {
  return Math.round(Math.min(1, alpha) * 100)
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
