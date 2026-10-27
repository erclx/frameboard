import { type DefaultTreeAdapterTypes, serialize } from 'parse5'

import { type Element, type FrameTree, parseFrame } from './address'
import {
  escapeAttribute,
  rawAttribute,
  removeAttribute,
  setRawAttribute,
} from './attribute'
import { type ElementSpan, type SpanScope, spanText } from './element-span'
import { declaredValues, setDeclaration } from './style'
import { setText } from './text'

export interface ElementAddress {
  /** The element's position in the browser's `querySelectorAll('*')` order. */
  readonly index: number
  /** SHA-256 hex of the file the index was read from, refused as stale once it differs. */
  readonly hash?: string
}

/** A change that writes one value, being a declaration, an attribute, or the text. */
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
  | { readonly kind: 'text'; readonly value: string }

export type EditChange =
  | SingleChange
  /** Several declarations written into one style, so an undo puts them back together. */
  | {
      readonly kind: 'styles'
      readonly declarations: readonly StyleDeclaration[]
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
  const invalid = checkValue(change.value)
  if (invalid) return invalid
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
export function scopeOf(change: EditChange): SpanScope {
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
    const written = setText(source, element, change.value)
    return written.ok ? written : refuse('not-text-only', written.detail)
  }
  if (change.kind === 'attribute') {
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
 * Whether the output's tree is the input's with only the target changed. The
 * target's edited attribute, or its text, is copied across from the output,
 * so the comparison covers every other node, and the caller's own check
 * covers the value itself.
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
  if (name === undefined) {
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

function textOf(element: Element): string {
  return element.childNodes
    .map((node) =>
      'value' in node && node.nodeName === '#text' ? node.value : '',
    )
    .join('')
}

/** Whether the target holds the value the change asked for. */
function holdsValue(element: Element, change: EditChange): boolean {
  if (change.kind === 'text') return textOf(element) === change.value
  if (change.kind === 'attribute') {
    return (
      element.attrs.find((attribute) => isNamed(attribute, change.name))
        ?.value === change.value
    )
  }
  const style =
    element.attrs.find((attribute) => attribute.name === 'style')?.value ?? ''
  const declarations = change.kind === 'styles' ? change.declarations : [change]
  return declarations.every(({ property, value }) => {
    const declared = declaredValues(style, property)
    const wanted = value.trim()
    return wanted === ''
      ? declared.length === 0
      : declared.length === 1 && declared[0] === wanted
  })
}

/**
 * Applies one change to the element the address names and leaves every other
 * byte of the source as it was, a `styles` change writing each declaration in
 * turn into the one style attribute. The output is parsed again and refused as
 * `verify-failed` unless its tree is the input's with that one change, so an
 * input the guards never met is refused rather than written corrupted.
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
