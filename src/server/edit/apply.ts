import { type DefaultTreeAdapterTypes, serialize } from 'parse5'

import { type Element, type FrameTree, parseFrame } from './address'
import {
  escapeAttribute,
  rawAttribute,
  removeAttribute,
  setRawAttribute,
} from './attribute'
import { type ElementSpan, type SpanScope, spanText } from './element-span'
import { declaredValues, setDeclaration, shorthandValue } from './style'
import { setText } from './text'

export interface ElementAddress {
  /** The element's position in the browser's `querySelectorAll('*')` order. */
  readonly index: number
  /** SHA-256 hex of the file the index was read from, refused as stale once it differs. */
  readonly hash?: string
}

/**
 * A change writing one value or dropping an attribute, which is its own member,
 * since `muted=""` is a stated boolean that keeps the element muted.
 */
export type SingleChange =
  | {
      readonly kind: 'style'
      readonly property: string
      readonly value: string
    }
  | {
      readonly kind: 'attribute'
      readonly name: string
      readonly value: string
    }
  | {
      readonly kind: 'attribute'
      readonly name: string
      readonly remove: true
    }
  | {
      readonly kind: 'text'
      readonly value: string
      /** One text node among the element's text-node children, the rest kept, where absent the whole content is the text. */
      readonly run?: number
    }

export type EditChange =
  | SingleChange
  /** Several declarations written into one style, so an undo puts them back together. */
  | {
      readonly kind: 'styles'
      readonly declarations: readonly StyleDeclaration[]
    }

/** Hides an element or shows it again, which a batch alone takes, since what it writes depends on the frame's sheets. */
export interface HiddenChange {
  readonly kind: 'hidden'
  readonly value: boolean
}

export interface StyleDeclaration {
  readonly property: string
  readonly value: string
}

export type EditRefusal =
  | 'invalid-edit'
  | 'invalid-address'
  | 'address-mismatch'
  | 'open-quote'
  | 'not-text-only'
  | 'verify-failed'
  | 'invalid-utf8'
  | 'stale-address'
  | 'invalid-container'
  | 'reanchors-descendant'

export interface EditRefused {
  readonly ok: false
  readonly reason: EditRefusal
  readonly detail: string
}

export type AppliedEdit =
  | {
      readonly ok: true
      readonly html: string
      /** The edited element's bytes on both sides, which an undo swaps back. */
      readonly span: ElementSpan
    }
  | EditRefused

type Written = { readonly ok: true; readonly html: string } | EditRefused

const MAX_VALUE_LENGTH = 200

/** Anything that would end the declaration and start another. */
const DECLARATION_BREAK = /[;{}<>\n\r]/

const PROPERTY_NAME = /^(?:--[\w-]+|-?[a-z][a-z0-9-]*)$/i

/** What the tokenizer reads as one attribute name. */
const ATTRIBUTE_NAME = /^[^\s"'<>/=]+$/

export function refuse(reason: EditRefusal, detail: string): EditRefused {
  return { ok: false, reason, detail }
}

function checkValue(value: string): EditRefused | undefined {
  return value.length > MAX_VALUE_LENGTH
    ? refuse(
        'invalid-edit',
        `the value runs past ${MAX_VALUE_LENGTH} characters`,
      )
    : undefined
}

function checkDeclaration({
  property,
  value,
}: StyleDeclaration): EditRefused | undefined {
  const invalid = checkValue(value)
  if (invalid) return invalid
  if (!PROPERTY_NAME.test(property)) {
    return refuse('invalid-edit', `${property} is not a CSS property name`)
  }
  if (DECLARATION_BREAK.test(value)) {
    return refuse(
      'invalid-edit',
      `${property} takes one value, with no ; { } < > or line break`,
    )
  }
  return undefined
}

function checkChange(change: EditChange): EditRefused | undefined {
  if (change.kind === 'style') return checkDeclaration(change)
  if (change.kind === 'styles') {
    const { declarations } = change
    if (declarations.length === 0) {
      return refuse('invalid-edit', 'a styles edit names no declaration')
    }
    const properties = new Set(declarations.map(({ property }) => property))
    if (properties.size !== declarations.length) {
      return refuse(
        'invalid-edit',
        'a styles edit names one property twice, so one value would be lost',
      )
    }
    for (const declaration of declarations) {
      const invalid = checkDeclaration(declaration)
      if (invalid) return invalid
    }
    return undefined
  }
  if ('value' in change) {
    const invalid = checkValue(change.value)
    if (invalid) return invalid
  }
  if (
    change.kind === 'text' &&
    change.run !== undefined &&
    !(Number.isInteger(change.run) && change.run >= 0)
  ) {
    return refuse('invalid-edit', `${change.run} names no text run`)
  }
  if (change.kind === 'attribute') {
    if (!ATTRIBUTE_NAME.test(change.name)) {
      return refuse('invalid-edit', `${change.name} is not an attribute name`)
    }
    if (change.name.toLowerCase() === 'style') {
      return refuse(
        'invalid-edit',
        'style is edited one declaration at a time, as a style edit',
      )
    }
  }
  return undefined
}

function resolve(tree: FrameTree, index: number): Element | EditRefused {
  if (tree.unstated) {
    return refuse(
      'address-mismatch',
      `the browser builds a <${tree.unstated.tagName}> the file does not state, so indices after it disagree`,
    )
  }
  const element = Number.isInteger(index) ? tree.elements[index] : undefined
  if (!element) {
    return refuse(
      'invalid-address',
      `the frame holds elements 0 to ${tree.elements.length - 1}, so ${index} names none`,
    )
  }
  if (!element.sourceCodeLocation?.startTag) {
    return refuse(
      'address-mismatch',
      `<${element.tagName}> at ${index} is implied, not stated in the file`,
    )
  }
  return element
}

/** Which bytes of the element a change reads and writes, as `SpanScope` splits them. */
export function scopeOf(change: EditChange | HiddenChange): SpanScope {
  return change.kind === 'text' ? 'element' : 'start-tag'
}

/** The attribute name an edit writes, or undefined for a text edit. */
function editedAttribute(change: EditChange): string | undefined {
  if (change.kind === 'style' || change.kind === 'styles') return 'style'
  if (change.kind === 'attribute') return change.name
  return undefined
}

function write(source: string, element: Element, change: EditChange): Written {
  if (change.kind === 'text') {
    const written = setText(source, element, change.value, change.run)
    return written.ok ? written : refuse('not-text-only', written.detail)
  }
  if (change.kind === 'attribute') {
    if ('remove' in change) {
      return { ok: true, html: removeAttribute(source, element, change.name) }
    }
    return {
      ok: true,
      html: setRawAttribute(
        source,
        element,
        change.name,
        escapeAttribute(change.value),
      ),
    }
  }
  const declarations = change.kind === 'styles' ? change.declarations : [change]
  let style = rawAttribute(source, element, 'style') ?? ''
  for (const { property, value } of declarations) {
    const next = setDeclaration(style, property, escapeAttribute(value))
    if (!next.ok) {
      return refuse(
        'open-quote',
        `the style on <${element.tagName}> ends inside an open quote or comment`,
      )
    }
    style = next.style
  }
  return {
    ok: true,
    html:
      style === ''
        ? removeAttribute(source, element, 'style')
        : setRawAttribute(source, element, 'style', style),
  }
}

/**
 * Whether an attribute is the one the file states under a lowercased name.
 * In SVG and MathML, parse5 adjusts names after tokenizing, turning `viewbox`
 * into `viewBox` and `xlink:href` into `href` under an `xlink` prefix.
 */
function isNamed(
  attribute: DefaultTreeAdapterTypes.Element['attrs'][number],
  name: string,
): boolean {
  const stated = attribute.prefix
    ? `${attribute.prefix}:${attribute.name}`
    : attribute.name
  return stated.toLowerCase() === name
}

/**
 * Whether only the target changed, its edited part copied across so the
 * comparison covers every other node.
 */
function changesOnlyTarget(
  before: FrameTree,
  after: FrameTree,
  index: number,
  change: EditChange,
): boolean {
  if (after.elements.length !== before.elements.length) return false
  const was = before.elements[index]
  const now = after.elements[index]
  if (!was || !now || was.tagName !== now.tagName) return false
  const name = editedAttribute(change)
  if (change.kind === 'text' && change.run !== undefined) {
    // Only the run is copied, so a changed child element still fails the comparison.
    const run = textNodes(was)[change.run]
    const written = textNodes(now)[change.run]
    if (!run) return false
    was.childNodes =
      change.value === ''
        ? was.childNodes.filter((node) => node !== run)
        : was.childNodes.map((node) =>
            node === run && written ? written : node,
          )
  } else if (name === undefined) {
    was.childNodes = now.childNodes
  } else {
    const written = now.attrs.find((attribute) => isNamed(attribute, name))
    const others = was.attrs.filter((attribute) => !isNamed(attribute, name))
    was.attrs = written ? [...others, written] : others
    now.attrs = written
      ? [...now.attrs.filter((attribute) => attribute !== written), written]
      : now.attrs
  }
  return serialize(before.document) === serialize(after.document)
}

function textNodes(element: Element): DefaultTreeAdapterTypes.TextNode[] {
  return element.childNodes.filter(
    (node): node is DefaultTreeAdapterTypes.TextNode =>
      node.nodeName === '#text',
  )
}

function textOf(element: Element): string {
  return textNodes(element)
    .map((node) => node.value)
    .join('')
}

/** Whether the target holds the value the change asked for. */
function holdsValue(element: Element, change: EditChange): boolean {
  if (change.kind === 'text' && change.run !== undefined) {
    // An emptied run leaves no node, which the target comparison then proves.
    return (
      change.value === '' ||
      textNodes(element)[change.run]?.value === change.value
    )
  }
  if (change.kind === 'text') return textOf(element) === change.value
  if (change.kind === 'attribute') {
    const stated = element.attrs.find((attribute) =>
      isNamed(attribute, change.name),
    )
    return 'remove' in change
      ? stated === undefined
      : stated?.value === change.value
  }
  const style =
    element.attrs.find((attribute) => attribute.name === 'style')?.value ?? ''
  const declarations = change.kind === 'styles' ? change.declarations : [change]
  return declarations.every(({ property, value }) => {
    const declared = declaredValues(style, property)
    const wanted = value.trim()
    if (wanted === '') return declared.length === 0
    // A longhand over its shorthand rewrites the part, which holds the value instead.
    return declared.length === 0
      ? shorthandValue(style, property) === wanted
      : declared.length === 1 && declared[0] === wanted
  })
}

/**
 * Applies one change, keeping every other byte, and re-parses the output,
 * refusing `verify-failed` rather than write a corrupted file.
 */
export function applyEdit(
  source: string,
  address: Pick<ElementAddress, 'index'>,
  change: EditChange,
): AppliedEdit {
  const normalized: EditChange =
    change.kind === 'style'
      ? { ...change, property: change.property.toLowerCase() }
      : change.kind === 'styles'
        ? {
            ...change,
            declarations: change.declarations.map((declaration) => ({
              ...declaration,
              property: declaration.property.toLowerCase(),
            })),
          }
        : change.kind === 'attribute'
          ? { ...change, name: change.name.toLowerCase() }
          : change
  const invalid = checkChange(normalized)
  if (invalid) return invalid

  const before = parseFrame(source)
  const element = resolve(before, address.index)
  if ('ok' in element) return element

  const written = write(source, element, normalized)
  if (!written.ok) return written

  const after = parseFrame(written.html)
  const target = after.elements[address.index]
  if (
    !target ||
    !holdsValue(target, normalized) ||
    !changesOnlyTarget(before, after, address.index, normalized)
  ) {
    return refuse(
      'verify-failed',
      `the edit to <${element.tagName}> would change more than that element, so nothing was written`,
    )
  }
  const scope = scopeOf(normalized)
  const span: ElementSpan = {
    scope,
    index: address.index,
    count: before.elements.length,
    before: spanText(source, element, scope),
    after: spanText(written.html, target, scope),
  }
  return { ok: true, html: written.html, span }
}
