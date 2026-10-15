import { serialize } from 'parse5'

import { type Element, type FrameTree, parseFrame } from './address'
import {
  escapeAttribute,
  rawAttribute,
  removeAttribute,
  setRawAttribute,
} from './attribute'
import { declaredValues, setDeclaration } from './style'
import { setText } from './text'

export interface ElementAddress {
  /** The element's position in the browser's `querySelectorAll('*')` order. */
  readonly index: number
  /** SHA-256 hex of the file the index was read from, refused as stale once it differs. */
  readonly hash?: string
}

export type EditChange =
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

export type EditRefusal =
  | 'invalid-edit'
  | 'invalid-address'
  | 'address-mismatch'
  | 'open-quote'
  | 'not-text-only'
  | 'verify-failed'
  | 'invalid-utf8'
  | 'stale-address'

export interface EditRefused {
  readonly ok: false
  readonly reason: EditRefusal
  readonly detail: string
}

export type AppliedEdit =
  | { readonly ok: true; readonly html: string }
  | EditRefused

const MAX_VALUE_LENGTH = 200

/** Anything that would end the declaration and start another. */
const DECLARATION_BREAK = /[;{}<>\n\r]/

const PROPERTY_NAME = /^(?:--[\w-]+|-?[a-z][a-z0-9-]*)$/i

/** What the tokenizer reads as one attribute name. */
const ATTRIBUTE_NAME = /^[^\s"'<>/=]+$/

export function refuse(reason: EditRefusal, detail: string): EditRefused {
  return { ok: false, reason, detail }
}

function checkChange(change: EditChange): EditRefused | undefined {
  if (change.value.length > MAX_VALUE_LENGTH) {
    return refuse(
      'invalid-edit',
      `the value runs past ${MAX_VALUE_LENGTH} characters`,
    )
  }
  if (change.kind === 'style') {
    if (!PROPERTY_NAME.test(change.property)) {
      return refuse(
        'invalid-edit',
        `${change.property} is not a CSS property name`,
      )
    }
    if (DECLARATION_BREAK.test(change.value)) {
      return refuse(
        'invalid-edit',
        `${change.property} takes one value, with no ; { } < > or line break`,
      )
    }
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

/** The attribute name an edit writes, or undefined for a text edit. */
function editedAttribute(change: EditChange): string | undefined {
  if (change.kind === 'style') return 'style'
  if (change.kind === 'attribute') return change.name
  return undefined
}

function write(
  source: string,
  element: Element,
  change: EditChange,
): AppliedEdit {
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
  const raw = rawAttribute(source, element, 'style') ?? ''
  const next = setDeclaration(
    raw,
    change.property,
    escapeAttribute(change.value),
  )
  if (!next.ok) {
    return refuse(
      'open-quote',
      `the style on <${element.tagName}> ends inside an open quote`,
    )
  }
  return {
    ok: true,
    html:
      next.style === ''
        ? removeAttribute(source, element, 'style')
        : setRawAttribute(source, element, 'style', next.style),
  }
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
    const written = now.attrs.find((attribute) => attribute.name === name)
    const others = was.attrs.filter((attribute) => attribute.name !== name)
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
      element.attrs.find((attribute) => attribute.name === change.name)
        ?.value === change.value
    )
  }
  const style =
    element.attrs.find((attribute) => attribute.name === 'style')?.value ?? ''
  const declared = declaredValues(style, change.property)
  const value = change.value.trim()
  return value === ''
    ? declared.length === 0
    : declared.length === 1 && declared[0] === value
}

/**
 * Applies one change to the element the address names and leaves every other
 * byte of the source as it was. The output is parsed again and refused as
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
  return written
}
