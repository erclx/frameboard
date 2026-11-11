import { readFileSync } from 'node:fs'

import type { Element } from 'domhandler'
import postcss, { type Declaration, type Root, type Rule } from 'postcss'

import type { Finding, FindingLocation } from '@/shared/records/check'

import { compileSelector, styles } from './cascade'
import {
  attributeLocation,
  boardPath,
  type FrameSource,
  isInside,
  localTarget,
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
      'A var() with no fallback names a custom property no token sheet, frame sheet, style attribute, or script write declares',
  },
]

const finding = findingFor(CUSTOM_PROPERTY_RULES)

/** A `var()` naming its property, with no fallback after a comma. */
const BARE_VAR = /var\(\s*(--[\w-]+)\s*\)/g

/**
 * The two ways a script writes a custom property by a name it spells out:
 * `setProperty('--name', …)`, and a `--name:` declaration in a string it
 * hands a style attribute or `cssText`. A read such as `getPropertyValue`
 * matches neither, so it still reports.
 */
const SCRIPT_WRITES = [
  /\.setProperty\(\s*(['"`])(--[\w-]+)\1/g,
  /(?<![\w-])(--[\w-]+)\s*:/g,
]

interface Use {
  name: string
  path: string
  location: FindingLocation | null
}

/**
 * `unknown-token`, one finding per bare `var()` in the frame's own sheets
 * and style attributes whose name nothing declares. A token sheet's own
 * references are the board's to answer for, so only its declarations count.
 * A name a `<script>` writes counts as declared, read off its text since the
 * check never runs it, so a name the script builds at runtime still reports.
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

  for (const element of source.elements) {
    if (element.name !== 'script') continue
    for (const name of scriptWrites(scriptText(element, source))) {
      declared.add(name)
    }
  }

  return uses
    .filter((use) => !declared.has(use.name))
    .map((use) =>
      finding('unknown-token', {
        frame: source.ref,
        path: use.path,
        message: `var(${use.name}) names a custom property nothing declares, so the declaration resolves to nothing. Use a token the project's tokens.css declares, or give it a fallback, such as var(${use.name}, red). If a script sets it at runtime under a name the check cannot read, the fallback is the way out.`,
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

function scriptWrites(text: string): string[] {
  return SCRIPT_WRITES.flatMap((pattern) =>
    [...text.matchAll(pattern)].map((match) => match.at(-1) ?? ''),
  )
}

/**
 * A script's inline text, or its `src` file's when the file sits in the
 * board. A remote, outside, or unreadable `src` reads as empty, since the
 * write hook never reports a read as failed.
 */
function scriptText(element: Element, source: FrameSource): string {
  const src = element.attribs.src
  if (src === undefined) return textOf(element)
  const file = localTarget(src, source.pageDir)
  if (!file || !isInside(source.root, file)) return ''
  try {
    return readFileSync(file, 'utf8')
  } catch {
    return ''
  }
}

function textOf(element: Element): string {
  return element.children
    .map((node) => ('data' in node ? node.data : ''))
    .join('')
}

function parseOrNull(css: string): Root | null {
  try {
    return postcss.parse(css)
  } catch {
    return null
  }
}
