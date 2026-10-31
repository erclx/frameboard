import type { Element } from 'domhandler'
import postcss, { type Declaration, type Root, type Rule } from 'postcss'

import type { Finding, FindingLocation } from '@/shared/records/check'

import { compileSelector, styles } from './cascade'
import {
  attributeLocation,
  boardPath,
  type FrameSource,
  locate,
  parseSheet,
  type Sheet,
} from './frame-source'
import { findingFor, type RuleDoc } from './rule'

export const CUSTOM_PROPERTY_RULES: RuleDoc[] = [
  {
    id: 'unknown-token',
    tier: 'exact',
    severity: 'warning',
    description:
      'A var() with no fallback names a custom property no token sheet, frame sheet, or style attribute declares',
  },
]

const finding = findingFor(CUSTOM_PROPERTY_RULES)

/** A `var()` naming its property, with no fallback after a comma. */
const BARE_VAR = /var\(\s*(--[\w-]+)\s*\)/g

interface Use {
  name: string
  path: string
  location: FindingLocation | null
}

/**
 * `unknown-token`, one finding per bare `var()` in the frame's own sheets
 * and style attributes whose name nothing declares. A token sheet's own
 * references are the board's to answer for, so only its declarations count.
 * A property a script sets reads as unknown, which a fallback silences.
 * A linked sheet's rule matching no element in the frame stays quiet, since a
 * site sheet styles other pages. The frame's own `<style>` keeps reporting,
 * since its theme and state rules match elements no static tree marks.
 */
export function checkUnknownTokens(
  source: FrameSource,
  tokens: Sheet[],
): Finding[] {
  const declared = new Set<string>()
  const uses: Use[] = []

  for (const sheet of [...tokens, ...source.sheets]) {
    const { root } = parseSheet(sheet.css)
    root.walkAtRules(/^property$/i, (rule) => {
      declared.add(rule.params.trim())
    })
    const text = sheet.origin === 'style' ? source.html : sheet.css
    root.walkDecls((node) => {
      if (node.prop.startsWith('--')) declared.add(node.prop)
      if (sheet.origin === 'token') return
      if (sheet.origin === 'linked' && matchesNothing(node, source.elements)) {
        return
      }
      for (const name of bareVars(node.value)) {
        uses.push({
          name,
          path: boardPath(source.root, sheet.path),
          location: locate(
            text,
            sheet.offset + (node.source?.start?.offset ?? 0),
            sheet.offset + (node.source?.end?.offset ?? 0),
          ),
        })
      }
    })
  }

  const framePath = boardPath(source.root, source.path)
  for (const element of source.elements) {
    const style = element.attribs.style
    if (!style) continue
    const root = parseOrNull(`x{${style}}`)
    if (!root) continue
    root.walkDecls((node) => {
      if (node.prop.startsWith('--')) declared.add(node.prop)
      for (const name of bareVars(node.value)) {
        uses.push({
          name,
          path: framePath,
          location: attributeLocation(element, 'style'),
        })
      }
    })
  }

  return uses
    .filter((use) => !declared.has(use.name))
    .map((use) =>
      finding('unknown-token', {
        frame: source.ref,
        path: use.path,
        message: `var(${use.name}) names a custom property nothing declares, so the declaration resolves to nothing. Use a token the project's tokens.css declares, or give it a fallback, such as var(${use.name}, red).`,
        location: use.location,
      }),
    )
}

/**
 * Whether `node` sits in a rule none of whose selectors matches an element.
 * A declaration outside a rule, or a selector the check cannot match
 * statically, counts as matching, so the use still reports.
 */
function matchesNothing(node: Declaration, elements: Element[]): boolean {
  const rule = node.parent
  if (rule?.type !== 'rule' || !styles(rule as Rule)) return false
  return (rule as Rule).selectors.every((selector) => {
    const matches = compileSelector(selector)
    return matches !== null && !elements.some(matches)
  })
}

function bareVars(value: string): string[] {
  return [
    ...new Set([...value.matchAll(BARE_VAR)].map((match) => match[1] ?? '')),
  ]
}

function parseOrNull(css: string): Root | null {
  try {
    return postcss.parse(css)
  } catch {
    return null
  }
}
