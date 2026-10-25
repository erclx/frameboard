import type { Page } from 'playwright-core'
import postcss, {
  type AtRule,
  type CssSyntaxError,
  type Declaration,
  type Document,
  type Node,
  type Root,
} from 'postcss'

import type { Finding, FindingLocation } from '@/shared/records/check'

import {
  attributeLocation,
  boardPath,
  type FrameSource,
  locate,
  offsetOf,
  parseSheet,
  type Sheet,
} from '../frame-source'
import { finding, type RuleDoc } from '../rule'

export const DECLARATION_RULES: RuleDoc[] = [
  {
    id: 'dropped-declaration',
    tier: 'browser',
    description:
      "A declaration the page's own CSS parser drops, being a misspelled property, a value it cannot read, or a sheet that stops parsing",
  },
]

/**
 * At-rules whose blocks hold descriptors rather than properties, which
 * `CSS.supports` cannot answer, and `@supports`, whose block is a
 * deliberate guess.
 */
const SKIPPED_BLOCKS =
  /^(font-face|property|page|counter-style|font-palette-values|supports)$/i

/** Prefixes for engines the board never renders in. */
const FOREIGN_PREFIX = /^-(moz|ms|o)-/i

interface Written {
  property: string
  value: string
  path: string
  location: FindingLocation | null
}

/**
 * `dropped-declaration`, one finding per declaration in the frame's own
 * sheets and style attributes that the open page's `CSS.supports` refuses,
 * and one per sheet postcss cannot parse, at the break it stops on, checking
 * the declarations ahead of the break. Theme
 * plays no part, so a caller runs it on one theme's page.
 */
export async function checkDeclarations(
  page: Page,
  source: FrameSource,
): Promise<Finding[]> {
  const findings: Finding[] = []
  const written: Written[] = []

  for (const sheet of source.sheets) {
    const path = boardPath(source.root, sheet.path)
    const text = sheet.origin === 'style' ? source.html : sheet.css
    const { root, error } = parseSheet(sheet.css)
    if (error) {
      findings.push(
        finding('dropped-declaration', {
          frame: source.ref,
          path,
          message: `The sheet stops parsing here: ${error.reason}. The browser drops the declarations the break swallows, so close the rule, the string, or the comment.`,
          location: syntaxLocation(text, sheet, error),
        }),
      )
    }
    root.walkDecls((node) => {
      if (!checkable(node)) return
      written.push({
        property: node.prop,
        value: node.value,
        path,
        location: locate(
          text,
          sheet.offset + (node.source?.start?.offset ?? 0),
          sheet.offset + (node.source?.end?.offset ?? 0),
        ),
      })
    })
  }

  const framePath = boardPath(source.root, source.path)
  for (const element of source.elements) {
    const style = element.attribs.style
    if (!style) continue
    let root: Root
    try {
      root = postcss.parse(`x{${style}}`)
    } catch {
      continue
    }
    root.walkDecls((node) => {
      if (!checkable(node)) return
      written.push({
        property: node.prop,
        value: node.value,
        path: framePath,
        location: attributeLocation(element, 'style'),
      })
    })
  }

  const supported = await page.evaluate(
    (pairs) => pairs.map(([property, value]) => CSS.supports(property, value)),
    written.map((each): [string, string] => [each.property, each.value]),
  )
  written.forEach((each, index) => {
    if (supported[index]) return
    findings.push(
      finding('dropped-declaration', {
        frame: source.ref,
        path: each.path,
        message: `The browser drops ${each.property}: ${each.value}, since it reads no such property or no such value for it. Check the spelling of both, and the unit of a length, such as 12px.`,
        location: each.location,
      }),
    )
  })
  return findings
}

function checkable(node: Declaration): boolean {
  if (node.prop.startsWith('--') || FOREIGN_PREFIX.test(node.prop)) {
    return false
  }
  for (
    let parent: Node | Document | undefined = node.parent;
    parent;
    parent = parent.parent
  ) {
    if (
      parent.type === 'atrule' &&
      SKIPPED_BLOCKS.test((parent as AtRule).name)
    ) {
      return false
    }
  }
  return true
}

/** Where postcss stopped, as an offset into the file the sheet sits in. */
function syntaxLocation(
  text: string,
  sheet: Sheet,
  error: CssSyntaxError,
): FindingLocation | null {
  if (error.line === undefined || error.column === undefined) return null
  const start = sheet.offset + offsetOf(sheet.css, error.line, error.column)
  return locate(text, start, start + 1)
}
