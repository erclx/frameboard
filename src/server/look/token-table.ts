import { readFileSync } from 'node:fs'
import { relative, sep } from 'node:path'

import postcss, { type AtRule, type Node, type Rule } from 'postcss'

import { isLiteralColor } from '@/server/checks/theme'
import type { TokenSheetPaths } from '@/server/checks/tokens'
import { contentHash } from '@/server/edit/address'
import type { TokenRow, TokenTable } from '@/shared/records/tokens'

export type Side = 'light' | 'dark' | 'base'

// Compared with whitespace and quotes removed, so `[data-theme="dark"]` and
// `[data-theme=dark]` read alike.
const DARK_SELECTORS = new Set([
  '[data-theme=dark]',
  ':root[data-theme=dark]',
  '.dark',
])
const LIGHT_SELECTORS = new Set([
  '[data-theme=light]',
  ':root[data-theme=light]',
  '.light',
])
const BASE_SELECTOR = ':root'

/** One sheet's custom properties by name, in the order the sheet first sets them. */
export type SheetTokens = Map<string, Partial<Record<Side, string>>>

/**
 * Reads a project's token sheets into one row per custom property, with its
 * light and dark values after the project sheet overrides the board's. A
 * declaration under a dark selector or a dark `prefers-color-scheme` query is
 * dark, one under a light selector is light, and one under plain `:root`
 * fills whichever side its sheet sets no value for. A property set under no
 * recognized selector is left out. A sheet that does not parse is named with
 * its error and adds no rows.
 */
export function readTokenTable(
  root: string,
  paths: TokenSheetPaths,
): TokenTable {
  const sheets: TokenTable['sheets'] = []
  const read: {
    label: string
    kind: 'board' | 'project'
    tokens: SheetTokens
  }[] = []
  for (const [kind, path] of [
    ['board', paths.board],
    ['project', paths.project],
  ] as const) {
    if (!path) continue
    const label = sheetLabel(root, path)
    // A sheet that vanished before the read sends a hash no sheet has.
    let hash = ''
    try {
      const bytes = readFileSync(path)
      hash = contentHash(bytes)
      read.push({ label, kind, tokens: readSheet(bytes.toString('utf8')) })
      sheets.push({ path: label, kind, error: null, hash })
    } catch (error) {
      sheets.push({ path: label, kind, error: errorText(error), hash })
    }
  }

  const rows = new Map<string, TokenRow>()
  for (const { label, kind, tokens } of read) {
    for (const [name, sides] of tokens) {
      const light = sides.light ?? sides.base
      const dark = sides.dark ?? sides.base
      const held = rows.get(name)
      rows.set(name, {
        name,
        group: 'other',
        light: light ?? held?.light ?? null,
        dark: dark ?? held?.dark ?? null,
        sheet: label,
        overrides: kind === 'project' && held !== undefined,
      })
    }
  }
  const tokens = [...rows.values()].map((row) => ({
    ...row,
    group: groupOf(row),
  }))
  return { sheets, tokens }
}

export function readSheet(css: string): SheetTokens {
  const tokens: SheetTokens = new Map()
  postcss.parse(css).walkRules((rule) => {
    const side = sideOf(rule)
    if (!side) return
    rule.each((node) => {
      if (node.type !== 'decl' || !node.prop.startsWith('--')) return
      const sides = tokens.get(node.prop) ?? {}
      sides[side] = node.value.trim()
      tokens.set(node.prop, sides)
    })
  })
  return tokens
}

export function sideOf(rule: Rule): Side | null {
  const selectors = rule.selectors.map((selector) =>
    selector.replace(/[\s'"]/g, '').toLowerCase(),
  )
  const recognized = (set: Set<string>) =>
    selectors.some((selector) => set.has(selector))
  if (inDarkQuery(rule)) {
    return selectors.includes(BASE_SELECTOR) || recognized(DARK_SELECTORS)
      ? 'dark'
      : null
  }
  if (recognized(DARK_SELECTORS)) return 'dark'
  if (recognized(LIGHT_SELECTORS)) return 'light'
  return selectors.includes(BASE_SELECTOR) ? 'base' : null
}

function inDarkQuery(rule: Rule): boolean {
  let node: Node | undefined = rule.parent
  for (; node; node = node.parent) {
    if (
      node.type === 'atrule' &&
      (node as AtRule).name === 'media' &&
      /prefers-color-scheme\s*:\s*dark/i.test((node as AtRule).params)
    ) {
      return true
    }
  }
  return false
}

/**
 * A value reading as a color goes under Color whatever its name, since
 * naming conventions vary between sheets while a color value does not.
 */
function groupOf({ name, light, dark }: TokenRow): TokenRow['group'] {
  const value = light ?? dark ?? ''
  if (isLiteralColor(value)) return 'color'
  if (name.includes('radius')) return 'radius'
  if (name.includes('font')) return 'font'
  return 'other'
}

function sheetLabel(root: string, path: string): string {
  const inside = relative(root, path)
  return inside.startsWith('..') ? path : inside.split(sep).join('/')
}

function errorText(error: unknown): string {
  if (error instanceof postcss.CssSyntaxError) {
    return `${error.reason} at line ${error.line ?? 1}`
  }
  return error instanceof Error ? error.message : String(error)
}
