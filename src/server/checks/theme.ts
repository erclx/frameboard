import postcss, { type AtRule, type Node, type Rule } from 'postcss'

import type { Finding, FindingLocation } from '@/shared/records/check'

import {
  attributeLocation,
  boardPath,
  type FrameSource,
  locate,
} from './frame-source'
import { finding, type RuleDoc } from './rule'

export const THEME_RULES: RuleDoc[] = [
  {
    id: 'theme',
    tier: 'selector',
    description:
      'A frame setting literal colors defines the other theme too, through a [data-theme] selector, a prefers-color-scheme query, or light-dark()',
  },
]

const COLOR_PROPERTIES =
  /^(color|background(-color|-image)?|border(-(top|right|bottom|left|block|inline)(-(start|end))?)?(-color)?|outline(-color)?|fill|stroke|box-shadow|text-shadow|caret-color|accent-color|text-decoration(-color)?|column-rule(-color)?)$/i

const COLOR_FUNCTION = /\b(rgba?|hsla?|hwb|lab|lch|oklab|oklch|color)\(/i
const HEX_COLOR = /#[0-9a-f]{3,8}\b/i
// The CSS named colors, kept to the ones a frame plausibly writes, since a
// longer list matches words such as `tan` in an unrelated value.
const NAMED_COLOR =
  /\b(white|black|red|green|blue|gray|grey|silver|maroon|purple|fuchsia|lime|olive|yellow|navy|teal|aqua|orange|pink|brown|gold|indigo|violet|crimson|coral|salmon|khaki|beige|ivory|lavender|tomato|turquoise|slategray|slategrey|darkgray|darkgrey|lightgray|lightgrey|whitesmoke|ghostwhite|snow|gainsboro|dimgray|dimgrey)\b/i

/** `theme`, over the frame's own sheets and style attributes, never the token sheets. */
export function checkTheme(source: FrameSource): Finding[] {
  const { firstColor, bothThemes } = readThemeColors(source)
  if (!firstColor || bothThemes) return []
  const { path, location } = firstColor
  return [
    finding('theme', {
      frame: source.ref,
      path,
      message:
        'The frame sets its own colors for one theme alone. Define the other through [data-theme] or prefers-color-scheme, or take the colors from token variables.',
      location,
    }),
  ]
}

export interface ThemeColors {
  /** The first literal color the frame sets, null when it takes every color from tokens. */
  firstColor: { path: string; location: FindingLocation | null } | null
  /** Whether any of its sheets defines a second theme. */
  bothThemes: boolean
}

export function readThemeColors(source: FrameSource): ThemeColors {
  let firstColor: ThemeColors['firstColor'] = null
  let bothThemes = false

  for (const sheet of source.sheets) {
    let root
    try {
      root = postcss.parse(sheet.css)
    } catch {
      continue
    }
    const text = sheet.origin === 'style' ? source.html : sheet.css
    root.walk((node) => {
      if (definesTheme(node)) bothThemes = true
      if (node.type !== 'decl') return
      if (/light-dark\(/i.test(node.value)) bothThemes = true
      if (!firstColor && setsLiteralColor(node.prop, node.value)) {
        const start = sheet.offset + (node.source?.start?.offset ?? 0)
        const end = sheet.offset + (node.source?.end?.offset ?? 0)
        firstColor = {
          path: boardPath(source.root, sheet.path),
          location: locate(text, start, end),
        }
      }
    })
  }

  for (const element of source.elements) {
    const style = element.attribs.style
    if (!style) continue
    let root
    try {
      root = postcss.parse(`x{${style}}`)
    } catch {
      continue
    }
    root.walkDecls((node) => {
      if (/light-dark\(/i.test(node.value)) bothThemes = true
      if (!firstColor && setsLiteralColor(node.prop, node.value)) {
        firstColor = {
          path: boardPath(source.root, source.path),
          location: attributeLocation(element, 'style'),
        }
      }
    })
  }

  return { firstColor, bothThemes }
}

function definesTheme(node: Node): boolean {
  if (node.type === 'rule')
    return /\[\s*data-theme\b/i.test((node as Rule).selector)
  if (node.type === 'atrule') {
    return /prefers-color-scheme/i.test((node as AtRule).params)
  }
  return false
}

/**
 * Whether a declaration sets a color the frame chose itself. A color taken
 * from a token through `var()` passes, so a fallback inside one does not
 * count, and neither does a `url()` whose file name reads as a color.
 */
export function setsLiteralColor(property: string, value: string): boolean {
  if (!COLOR_PROPERTIES.test(property)) return false
  const own = stripFunctions(value, ['var', 'url'])
  return (
    HEX_COLOR.test(own) || COLOR_FUNCTION.test(own) || NAMED_COLOR.test(own)
  )
}

function stripFunctions(value: string, names: string[]): string {
  let result = value
  for (const name of names) {
    const open = new RegExp(`\\b${name}\\(`, 'i')
    for (let match = open.exec(result); match; match = open.exec(result)) {
      let depth = 0
      let end = match.index + name.length
      for (; end < result.length; end++) {
        if (result[end] === '(') depth += 1
        else if (result[end] === ')' && --depth === 0) break
      }
      result = result.slice(0, match.index) + result.slice(end + 1)
    }
  }
  return result
}
