import Specificity from '@bramus/specificity'
import { compile } from 'css-select'
import type { AnyNode, Element } from 'domhandler'
import postcss, { type AtRule, type Node, type Rule } from 'postcss'

import type { FrameSource, Sheet } from './frame-source'

/** The properties the selector rules read, with every custom property. */
const READ: ReadonlySet<string> = new Set([
  'font-family',
  'font',
  'text-transform',
])

/** The longhands a shorthand competes for, so `font` sets the family too. */
const SHORTHANDS: Record<string, readonly string[]> = {
  font: ['font-family'],
  background: ['background-color'],
  border: ['border-color', 'border-width'],
  'flex-flow': ['flex-direction', 'flex-wrap'],
}

/** The properties an element takes from its parent when no rule sets them. */
const INHERITED = new Set(['color', 'font-family', 'text-transform'])

/** At-rules whose blocks never style an element. */
const NOT_STYLING = new Set([
  'keyframes',
  '-webkit-keyframes',
  'font-face',
  'page',
  'counter-style',
  'property',
  'font-feature-values',
  'font-palette-values',
])

/**
 * The browser's own `font-family` for elements an author rule has not
 * reached: monospace for code, and the system control font for form
 * controls, which do not inherit the page's font. Null stands for that
 * control font, which no stylesheet names.
 */
const USER_AGENT_FAMILIES: Record<string, string | null> = {
  code: 'monospace',
  pre: 'monospace',
  kbd: 'monospace',
  samp: 'monospace',
  tt: 'monospace',
  listing: 'monospace',
  xmp: 'monospace',
  input: null,
  button: null,
  select: null,
  textarea: null,
}

const CSS_WIDE = new Set([
  'inherit',
  'unset',
  'initial',
  'revert',
  'revert-layer',
])

interface Declaration {
  property: string
  value: string
  important: boolean
  inline: boolean
  specificity: [number, number, number]
  /** Position across every sheet in cascade order, so the later of two ties wins. */
  order: number
}

interface CompiledRule {
  matches: (element: Element) => boolean
  declarations: Declaration[]
}

/** A property's value on an element, and the element that declared it. */
export interface Cascaded {
  value: string
  /** The element whose rule set it, which its `var()` references resolve on. */
  element: Element
  /** True when no author rule set it and the browser's own rule did. */
  userAgent: boolean
  /** True when it came from a shorthand, such as `font`, whose value holds more than the property. */
  shorthand?: boolean
}

export interface Cascade {
  /**
   * The first family an element renders text in, after inheritance and
   * `var()`. Null when no rule sets one, so the browser's default font
   * renders, which includes a form control no rule reached.
   */
  firstFamily: (element: Element) => string | null
  /** The `text-transform` an element inherits or sets, `none` when unset. */
  textTransform: (element: Element) => string
  /**
   * The winning declaration of a property the cascade was built to read, as
   * written, and the element it came from, which is an ancestor for an
   * inherited property. Null when no author rule sets it.
   */
  specified: (element: Element, property: string) => Cascaded | null
}

export interface CascadeOptions {
  /** The properties to read beside every custom property, the checks' own by default. */
  properties?: ReadonlySet<string>
}

/**
 * Builds the cascade for one frame over its token sheets and then its own,
 * so a frame rule wins a tie with a token rule as injection order makes it
 * win in the browser. Weighs `!important`, inline styles, and specificity
 * through `@bramus/specificity`, and takes every rule inside a media query
 * as applying, since a frame renders at one viewport the check cannot see.
 */
export function buildCascade(
  source: FrameSource,
  tokens: Sheet[],
  { properties = READ }: CascadeOptions = {},
): Cascade {
  const reads = (property: string) =>
    property.startsWith('--') || properties.has(property.toLowerCase())
  const rules: CompiledRule[] = []
  let order = 0
  for (const sheet of [...tokens, ...source.sheets]) {
    let root
    try {
      root = postcss.parse(sheet.css)
    } catch {
      continue
    }
    root.walkRules((rule) => {
      if (!styles(rule)) return
      const declared = rule.nodes.filter(
        (node) => node.type === 'decl' && reads(node.prop),
      )
      if (declared.length === 0) return
      for (const selector of rule.selectors) {
        const matches = compileSelector(selector)
        const specificity = specificityOf(selector)
        if (!matches || !specificity) continue
        rules.push({
          matches,
          declarations: declared.flatMap((node) =>
            node.type === 'decl'
              ? [
                  {
                    property: node.prop.startsWith('--')
                      ? node.prop
                      : node.prop.toLowerCase(),
                    value: node.value,
                    important: node.important,
                    inline: false,
                    specificity,
                    order: order++,
                  },
                ]
              : [],
          ),
        })
      }
    })
  }

  const winners = new Map<Element, Map<string, Declaration>>()
  const declaredOn = (element: Element): Map<string, Declaration> => {
    const cached = winners.get(element)
    if (cached) return cached
    const won = new Map<string, Declaration>()
    const consider = (declaration: Declaration) => {
      for (const property of SHORTHANDS[declaration.property] ?? [
        declaration.property,
      ]) {
        const current = won.get(property)
        if (!current || beats(declaration, current)) {
          won.set(property, declaration)
        }
      }
    }
    for (const rule of rules) {
      if (rule.matches(element)) rule.declarations.forEach(consider)
    }
    inlineDeclarations(element, reads).forEach(consider)
    winners.set(element, won)
    return won
  }

  /** The winning declaration of an inherited property, walking up from `element`. */
  const inherited = (element: Element, property: string): Cascaded | null => {
    for (
      let current: Element | null = element;
      current;
      current = parentOf(current)
    ) {
      const declaration = declaredOn(current).get(property)
      if (declaration) {
        const keyword = declaration.value.trim().toLowerCase()
        if (keyword === 'inherit' || keyword === 'unset') continue
        if (CSS_WIDE.has(keyword)) return null
        return {
          value: declaration.value,
          element: current,
          userAgent: false,
          shorthand: declaration.property !== property,
        }
      }
      if (property === 'font-family' && current.name in USER_AGENT_FAMILIES) {
        const family = USER_AGENT_FAMILIES[current.name]
        return family === null || family === undefined
          ? null
          : { value: family, element: current, userAgent: true }
      }
    }
    return null
  }

  const resolveVars = (
    value: string,
    element: Element,
    depth = 0,
  ): string | null => {
    if (depth > 16) return null
    let resolved = ''
    let rest = value
    for (
      let start = rest.search(/var\(/i);
      start !== -1;
      start = rest.search(/var\(/i)
    ) {
      const end = closingParen(rest, start + 3)
      if (end === -1) return null
      const [name = '', ...fallbackParts] = splitTopLevel(
        rest.slice(start + 4, end),
        ',',
      )
      const fallback = fallbackParts.length > 0 ? fallbackParts.join(',') : null
      const custom = inherited(element, name.trim())
      const replacement =
        custom === null
          ? fallback === null
            ? null
            : resolveVars(fallback, element, depth + 1)
          : resolveVars(custom.value, custom.element, depth + 1)
      if (replacement === null) return null
      resolved += rest.slice(0, start) + replacement
      rest = rest.slice(end + 1)
    }
    return resolved + rest
  }

  return {
    firstFamily: (element) => {
      for (let from: Element | null = element; from;) {
        const found = inherited(from, 'font-family')
        if (!found) return null
        if (found.userAgent) return found.value
        const value = resolveVars(found.value, found.element)
        // A var() with nothing behind it, or a shorthand that does not read,
        // is invalid at computed time, which makes the property inherit.
        const family =
          value === null
            ? 'unset'
            : found.shorthand
              ? (shorthandFamily(value) ?? 'unset')
              : value
        const keyword = family.trim().toLowerCase()
        if (keyword !== 'inherit' && keyword !== 'unset') {
          return CSS_WIDE.has(keyword) ? null : firstOf(family)
        }
        from = parentOf(found.element)
      }
      return null
    },
    textTransform: (element) => {
      const found = inherited(element, 'text-transform')
      if (!found) return 'none'
      return (resolveVars(found.value, found.element) ?? 'none')
        .trim()
        .toLowerCase()
    },
    specified: (element, property) => {
      if (INHERITED.has(property)) return inherited(element, property)
      const declaration = declaredOn(element).get(property)
      if (!declaration) return null
      if (CSS_WIDE.has(declaration.value.trim().toLowerCase())) return null
      return {
        value: declaration.value,
        element,
        userAgent: false,
        shorthand: declaration.property !== property,
      }
    },
  }
}

/** A rule styles elements unless it sits in a non-styling at-rule or inside another rule. */
function styles(rule: Rule): boolean {
  for (
    let parent: Node | undefined = rule.parent;
    parent;
    parent = parent.parent
  ) {
    if (parent.type === 'rule') return false
    if (
      parent.type === 'atrule' &&
      NOT_STYLING.has((parent as AtRule).name.toLowerCase())
    ) {
      return false
    }
  }
  return true
}

/**
 * A matcher for one selector, or null for one the check cannot match
 * statically: a pseudo-element, a state the frame is not in, or a selector
 * css-select does not support.
 */
function compileSelector(
  selector: string,
): ((element: Element) => boolean) | null {
  if (
    /::|:(before|after|first-line|first-letter|marker|placeholder|selection)\b/i.test(
      selector,
    )
  ) {
    return null
  }
  if (
    /:(hover|focus|focus-visible|focus-within|active|visited|target)\b/i.test(
      selector,
    )
  ) {
    return null
  }
  try {
    const query = compile<AnyNode, Element>(selector)
    return (element) => query(element)
  } catch {
    return null
  }
}

function specificityOf(selector: string): [number, number, number] | null {
  try {
    const [first] = Specificity.calculate(selector)
    return first ? first.toArray() : null
  } catch {
    return null
  }
}

/** Whether `a` wins over `b` for one property on one element. */
function beats(a: Declaration, b: Declaration): boolean {
  if (a.important !== b.important) return a.important
  if (a.inline !== b.inline) return a.inline
  for (let index = 0; index < 3; index++) {
    const difference = (a.specificity[index] ?? 0) - (b.specificity[index] ?? 0)
    if (difference !== 0) return difference > 0
  }
  return a.order > b.order
}

function inlineDeclarations(
  element: Element,
  reads: (property: string) => boolean,
): Declaration[] {
  const style = element.attribs.style
  if (!style) return []
  let root
  try {
    root = postcss.parse(`x{${style}}`)
  } catch {
    return []
  }
  const declarations: Declaration[] = []
  root.walkDecls((node) => {
    if (!reads(node.prop)) return
    declarations.push({
      property: node.prop.startsWith('--')
        ? node.prop
        : node.prop.toLowerCase(),
      value: node.value,
      important: node.important,
      inline: true,
      specificity: [0, 0, 0],
      order: Number.MAX_SAFE_INTEGER,
    })
  })
  return declarations
}

function parentOf(element: Element): Element | null {
  const parent = element.parent
  return parent && parent.type === 'tag' ? (parent as Element) : null
}

function closingParen(text: string, open: number): number {
  let depth = 0
  for (let index = open; index < text.length; index++) {
    if (text[index] === '(') depth += 1
    else if (text[index] === ')') {
      depth -= 1
      if (depth === 0) return index
    }
  }
  return -1
}

/** Splits on `separator` outside quotes and parentheses. */
export function splitTopLevel(text: string, separator: string): string[] {
  const parts: string[] = []
  let depth = 0
  let quote: string | null = null
  let start = 0
  for (let index = 0; index < text.length; index++) {
    const char = text[index]
    if (quote) {
      if (char === quote) quote = null
    } else if (char === '"' || char === "'") quote = char
    else if (char === '(') depth += 1
    else if (char === ')') depth -= 1
    else if (char === separator && depth === 0) {
      parts.push(text.slice(start, index))
      start = index + 1
    }
  }
  parts.push(text.slice(start))
  return parts
}

/** The first family of a `font-family` list, unquoted. */
function firstOf(families: string): string {
  const first = (splitTopLevel(families, ',')[0] ?? '').trim()
  return first.replace(/^(['"])(.*)\1$/, '$2').trim()
}

const SYSTEM_FONT_KEYWORDS = new Set([
  'caption',
  'icon',
  'menu',
  'message-box',
  'small-caption',
  'status-bar',
])

/**
 * The family part of a `font` shorthand, being everything after the size
 * and its optional line height. A system font keyword stands for the
 * control font, so it reads as no family the page chose.
 */
function shorthandFamily(value: string): string | null {
  const trimmed = value.trim()
  const keyword = trimmed.toLowerCase()
  if (CSS_WIDE.has(keyword)) return keyword
  if (SYSTEM_FONT_KEYWORDS.has(keyword)) return 'initial'
  const tokens = splitTopLevel(trimmed, ' ').filter((token) => token !== '')
  const sizeAt = tokens.findIndex((token) =>
    /^(?:[\d.]+(?:[a-z]+|%)|xx-small|x-small|small|medium|large|x-large|xx-large|xxx-large|smaller|larger|(?:calc|clamp|min|max)\(.*\))(?:\/.*)?$/i.test(
      token,
    ),
  )
  if (sizeAt === -1) return null
  let familyAt = sizeAt + 1
  // A line height written apart, as in `16px / 1.5`.
  if (tokens[familyAt] === '/') familyAt += 2
  else if (tokens[familyAt]?.startsWith('/')) familyAt += 1
  const family = tokens.slice(familyAt).join(' ')
  return family === '' ? null : family
}
