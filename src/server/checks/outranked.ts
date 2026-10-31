import type { Element } from 'domhandler'
import postcss, { type AtRule, type Node } from 'postcss'

import type { Finding } from '@/shared/records/check'

import { compileSelector, styles } from './cascade'
import {
  attributeLocation,
  boardPath,
  type FrameSource,
  parseSheet,
} from './frame-source'
import { finding, type RuleDoc } from './rule'

export const OUTRANKED_RULES: RuleDoc[] = [
  {
    id: 'outranked',
    tier: 'selector',
    description:
      "An agent's write changed a rule in the frame's own <style> that an element's unchanged style attribute also sets, so that element keeps its inline value, which may be the developer's hand edit. A warning the server raises against the bytes the write replaced, so the hook never reports it.",
  },
]

const SIDES = ['top', 'right', 'bottom', 'left'] as const
const LOGICAL = [
  'block-start',
  'block-end',
  'inline-start',
  'inline-end',
] as const

/** The longhands each shorthand sets, so `padding` competes with an inline `padding-left`. */
const SHORTHANDS: Record<string, readonly string[]> = {
  padding: [
    ...SIDES.map((side) => `padding-${side}`),
    ...LOGICAL.map((side) => `padding-${side}`),
  ],
  'padding-block': ['padding-block-start', 'padding-block-end'],
  'padding-inline': ['padding-inline-start', 'padding-inline-end'],
  margin: [
    ...SIDES.map((side) => `margin-${side}`),
    ...LOGICAL.map((side) => `margin-${side}`),
  ],
  'margin-block': ['margin-block-start', 'margin-block-end'],
  'margin-inline': ['margin-inline-start', 'margin-inline-end'],
  inset: [...SIDES],
  gap: ['row-gap', 'column-gap'],
  'grid-gap': ['row-gap', 'column-gap'],
  'flex-flow': ['flex-direction', 'flex-wrap'],
  flex: ['flex-grow', 'flex-shrink', 'flex-basis'],
  'place-items': ['align-items', 'justify-items'],
  'place-content': ['align-content', 'justify-content'],
  'place-self': ['align-self', 'justify-self'],
  overflow: ['overflow-x', 'overflow-y'],
  background: ['background-color', 'background-image'],
  font: [
    'font-family',
    'font-size',
    'font-weight',
    'font-style',
    'line-height',
  ],
  border: SIDES.flatMap((side) => [
    `border-${side}-width`,
    `border-${side}-style`,
    `border-${side}-color`,
  ]),
  'border-width': SIDES.map((side) => `border-${side}-width`),
  'border-style': SIDES.map((side) => `border-${side}-style`),
  'border-color': SIDES.map((side) => `border-${side}-color`),
  ...Object.fromEntries(
    SIDES.map((side) => [
      `border-${side}`,
      [`border-${side}-width`, `border-${side}-style`, `border-${side}-color`],
    ]),
  ),
  'border-radius': [
    'border-top-left-radius',
    'border-top-right-radius',
    'border-bottom-right-radius',
    'border-bottom-left-radius',
  ],
  outline: ['outline-width', 'outline-style', 'outline-color'],
}

interface RuleDeclaration {
  /** The selector as written, which the finding names. */
  selector: string
  property: string
  important: boolean
}

interface InlineDeclaration {
  property: string
  value: string
  important: boolean
}

interface Offender {
  index: number
  element: Element
  property: string
  selector: string
}

/**
 * `outranked`, over two versions of one frame: `before`, the bytes an agent's
 * write replaced, and `after`, the frame as that write left it. It names each
 * element whose style attribute declares, unchanged since `before`, a property
 * a rule the write changed in the frame's own `<style>` blocks also sets, since
 * a normal inline declaration beats every normal rule. Linked and token sheets
 * change through files of their own, so they are left out.
 */
export function checkOutranked(
  before: FrameSource,
  after: FrameSource,
): Finding[] {
  const changed = changedDeclarations(before, after)
  if (changed.length === 0) return []
  const matchers = new Map<string, ((element: Element) => boolean) | null>()
  const matches = (selector: string, element: Element) => {
    if (!matchers.has(selector)) {
      matchers.set(selector, compileSelector(selector))
    }
    return matchers.get(selector)?.(element) ?? false
  }

  const kept = inlineCounts(before)
  const offenders: Offender[] = []
  after.elements.forEach((element, index) => {
    let found: Offender | null = null
    for (const inline of inlineDeclarations(element)) {
      const key = inlineKey(element, inline)
      const count = kept.get(key) ?? 0
      // An inline value the write added is the agent's own, so it never trips.
      if (count === 0) continue
      kept.set(key, count - 1)
      if (found) continue
      const rule = changed.find(
        (declaration) =>
          (!declaration.important || inline.important) &&
          overlaps(declaration.property, inline.property) &&
          matches(declaration.selector, element),
      )
      if (rule) {
        found = {
          index,
          element,
          property: inline.property,
          selector: rule.selector,
        }
      }
    }
    if (found) offenders.push(found)
  })

  const [first] = offenders
  if (!first) return []
  const more = offenders.length - 1
  const others =
    more === 0
      ? ''
      : more === 1
        ? ', and 1 more element keeps an inline value the same way'
        : `, and ${more} more elements keep inline values the same way`
  return [
    finding('outranked', {
      frame: after.ref,
      path: boardPath(after.root, after.path),
      severity: 'warning',
      message: `This write changed the ${first.selector} rule, but <${first.element.name}> at element ${first.index} sets ${first.property} in its style attribute, which outranks every rule${others}. The style attribute may hold a value the developer set by hand, so change it too only if the new value should reach that element.`,
      location: attributeLocation(first.element, 'style'),
    }),
  ]
}

/** Every declaration in `after`'s own `<style>` blocks whose rule held a different value, or none, in `before`. */
function changedDeclarations(
  before: FrameSource,
  after: FrameSource,
): RuleDeclaration[] {
  const old = ruleValues(before)
  const changed: RuleDeclaration[] = []
  for (const [key, entry] of ruleValues(after)) {
    if (old.get(key)?.value === entry.value) continue
    changed.push(entry.declaration)
  }
  return changed
}

/**
 * Each styling declaration in a frame's own `<style>` blocks by its at-rule
 * context, selector, and property, the last in source order winning as a
 * repeated property does in the browser.
 */
function ruleValues(
  source: FrameSource,
): Map<string, { value: string; declaration: RuleDeclaration }> {
  const values = new Map<
    string,
    { value: string; declaration: RuleDeclaration }
  >()
  for (const sheet of source.sheets) {
    if (sheet.origin !== 'style') continue
    parseSheet(sheet.css).root.walkRules((rule) => {
      if (!styles(rule)) return
      const context = atRuleContext(rule)
      for (const node of rule.nodes) {
        if (node.type !== 'decl') continue
        const property = normalProperty(node.prop)
        for (const selector of rule.selectors) {
          const written = selector.trim().replace(/\s+/g, ' ')
          values.set(`${context}\n${written}\n${property}`, {
            value: `${node.value.trim()}${node.important ? ' !important' : ''}`,
            declaration: {
              selector: written,
              property,
              important: node.important,
            },
          })
        }
      }
    })
  }
  return values
}

function atRuleContext(node: Node): string {
  const parts: string[] = []
  for (let parent = node.parent; parent; parent = parent.parent) {
    if (parent.type === 'atrule') {
      const at = parent as AtRule
      parts.unshift(`@${at.name.toLowerCase()} ${at.params.trim()}`)
    }
  }
  return parts.join(' ')
}

/** How many times each tag carries each inline declaration in `source`. */
function inlineCounts(source: FrameSource): Map<string, number> {
  const counts = new Map<string, number>()
  for (const element of source.elements) {
    for (const inline of inlineDeclarations(element)) {
      const key = inlineKey(element, inline)
      counts.set(key, (counts.get(key) ?? 0) + 1)
    }
  }
  return counts
}

function inlineKey(element: Element, inline: InlineDeclaration): string {
  return `${element.name}\n${inline.property}\n${inline.value}\n${inline.important}`
}

function inlineDeclarations(element: Element): InlineDeclaration[] {
  const style = element.attribs.style
  if (!style) return []
  let root
  try {
    root = postcss.parse(`x{${style}}`)
  } catch {
    return []
  }
  const declarations: InlineDeclaration[] = []
  root.walkDecls((node) => {
    declarations.push({
      property: normalProperty(node.prop),
      value: node.value.trim(),
      important: node.important,
    })
  })
  return declarations
}

function normalProperty(property: string): string {
  return property.startsWith('--') ? property : property.toLowerCase()
}

/** Whether two properties set any longhand in common. */
function overlaps(a: string, b: string): boolean {
  if (a === b) return true
  const longhands = new Set(SHORTHANDS[a] ?? [a])
  return (SHORTHANDS[b] ?? [b]).some((longhand) => longhands.has(longhand))
}
