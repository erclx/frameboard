import { createHash } from 'node:crypto'
import { readdirSync, readFileSync, writeFileSync } from 'node:fs'

import fc from 'fast-check'
import {
  defaultTreeAdapter,
  type DefaultTreeAdapterTypes,
  parse,
  serialize,
} from 'parse5'
import { afterAll, describe, expect, it } from 'vitest'

import { applyEdit, type EditChange } from './apply'
import { changeArbitrary, frameArbitrary } from './frame-arbitrary'

// The oracle below derives what an edit should produce from parse5 and the
// change alone. It never calls the writer's own reparse check, or the run
// would prove the check agrees with itself.

type Element = DefaultTreeAdapterTypes.Element

const SEED = 2026
const RUNS = 2000
// The generated-frames case takes about 0.3 s alone and took 5269 ms once the
// machine ran several test processes, past vitest's 5 s default. 15 s matches
// `SHELL_TEST_TIMEOUT_MS`, the one other loaded budget.
const PROPERTY_TEST_TIMEOUT_MS = 15_000
const FIXTURES = new URL('../../../test/fixtures/frames/', import.meta.url)
const BOM = '\uFEFF'
const SHORTHAND_LONGHANDS: Readonly<Record<string, readonly string[]>> = {
  'border-radius': [
    'border-top-left-radius',
    'border-top-right-radius',
    'border-bottom-right-radius',
    'border-bottom-left-radius',
  ],
  padding: ['padding-top', 'padding-right', 'padding-bottom', 'padding-left'],
}

const digest = createHash('sha256')
const made = { style: 0, attribute: 0, text: 0 }

afterAll(() => {
  const path = process.env.FRAMEBOARD_EDIT_DIGEST
  if (path) writeFileSync(path, `${digest.digest('hex')}\n`)
})

/** Every element in `querySelectorAll('*')` order, template content skipped. */
function elementsOf(node: DefaultTreeAdapterTypes.ParentNode): Element[] {
  return node.childNodes.flatMap((child) =>
    'tagName' in child ? [child, ...elementsOf(child)] : [],
  )
}

/** Parses the way a browser does, its decoder having dropped a leading BOM. */
function browserParse(source: string): DefaultTreeAdapterTypes.Document {
  return parse(source.startsWith(BOM) ? source.slice(1) : source, {
    sourceCodeLocationInfo: true,
  })
}

type Attribute = Element['attrs'][number]

/** Matches the name the file states, which parse5 adjusts in SVG and MathML. */
function isStated(attribute: Attribute, name: string): boolean {
  const full = attribute.prefix
    ? `${attribute.prefix}:${attribute.name}`
    : attribute.name
  return full.toLowerCase() === name.toLowerCase()
}

function attributeIn(element: Element, name: string): Attribute | undefined {
  return element.attrs.find((attribute) => isStated(attribute, name))
}

function attributeOf(element: Element, name: string): string | undefined {
  return attributeIn(element, name)?.value
}

/** Gives the expected element the attribute as the output parsed it, or removes it. */
function setAttributeOf(
  element: Element,
  name: string,
  written: Attribute | undefined,
): void {
  const existing = attributeIn(element, name)
  if (written === undefined) {
    element.attrs = element.attrs.filter((attribute) => attribute !== existing)
  } else if (existing) existing.value = written.value
  else element.attrs.push({ ...written })
}

function textOf(element: Element): string {
  return element.childNodes
    .map((child) =>
      child.nodeName === '#text' && 'value' in child ? child.value : '',
    )
    .join('')
}

/**
 * A decoded style read as property to value, the later declaration winning.
 * Comments read as nothing, and a backslash escapes the character after it.
 */
function decodeStyle(style: string | undefined): Record<string, string> {
  const declared: Record<string, string> = {}
  const segments: string[] = []
  let quote: string | undefined
  let depth = 0
  let text = ''
  let start = 0
  const source = style ?? ''
  for (let at = 0; at < source.length; at += 1) {
    if (!quote && source.startsWith('/*', at)) {
      const close = source.indexOf('*/', at + 2)
      at = close === -1 ? source.length : close + 1
      continue
    }
    const char = source[at] ?? ''
    if (char === '\\') {
      text += source.slice(at, at + 2)
      at += 1
      continue
    }
    text += char
    if (quote) {
      if (char === quote) quote = undefined
    } else if (char === '"' || char === "'") quote = char
    else if (char === '(') depth += 1
    else if (char === ')') depth -= 1
    else if (char === ';' && depth === 0) {
      segments.push(text.slice(start, -1))
      start = text.length
    }
  }
  segments.push(text.slice(start))
  for (const segment of segments) {
    const colon = segment.indexOf(':')
    if (colon > 0) {
      declared[segment.slice(0, colon).trim().toLowerCase()] = segment
        .slice(colon + 1)
        .trim()
    }
  }
  return declared
}

function sorted(declared: Record<string, string>): string {
  return JSON.stringify(Object.entries(declared).sort())
}

/**
 * The UTF-16 span an edit may touch: the text between the tags, the edited
 * attribute with the whitespace ahead of it, or the gap after the last
 * attribute where an absent one goes in.
 */
function windowOf(
  source: string,
  element: Element,
  change: EditChange,
): [number, number] {
  const location = element.sourceCodeLocation
  if (!location?.startTag) throw new Error(`<${element.tagName}> is not stated`)
  if (change.kind === 'text') {
    if (!location.endTag) throw new Error(`<${element.tagName}> has no end tag`)
    return [location.startTag.endOffset, location.endTag.startOffset]
  }
  const name = change.kind === 'style' ? 'style' : change.name.toLowerCase()
  const span = location.attrs?.[name]
  if (span) {
    // Removing `\n  style` before `\n  id` leaves the same bytes as removing
    // `style\n  `, and a byte diff cannot tell which, so the window takes in
    // the whitespace on both sides.
    let start = span.startOffset
    while (/\s/.test(source[start - 1] ?? '')) start -= 1
    let end = span.endOffset
    while (/\s/.test(source[end] ?? '')) end += 1
    return [start, end]
  }
  const ends = Object.values(location.attrs ?? {}).map((attr) => attr.endOffset)
  const afterName = location.startTag.startOffset + 1 + element.tagName.length
  return [Math.max(afterName, ...ends), location.startTag.endOffset]
}

/** The byte span of `before` that differs from `after`, after their common ends. */
function changedSpan(before: Buffer, after: Buffer): [number, number] {
  let prefix = 0
  while (
    prefix < before.length &&
    prefix < after.length &&
    before[prefix] === after[prefix]
  ) {
    prefix += 1
  }
  let suffix = 0
  while (
    suffix < before.length - prefix &&
    suffix < after.length - prefix &&
    before[before.length - 1 - suffix] === after[after.length - 1 - suffix]
  ) {
    suffix += 1
  }
  return [prefix, before.length - suffix]
}

/**
 * Applies one edit and, unless the writer refused, checks the three
 * properties: the changed bytes lie inside the window, the reparsed tree is
 * the original with that one change, and a style edit keeps every other
 * declaration's decoded value.
 */
function checkEdit(source: string, index: number, change: EditChange): void {
  const result = applyEdit(source, { index }, change)
  digest.update(`${JSON.stringify(result)}\n`)
  if (!result.ok) return
  made[change.kind] += 1
  const output = result.html
  const holds = (condition: boolean, what: string): void => {
    if (!condition) {
      throw new Error(
        `${what}: ${JSON.stringify(change)} at ${index} in ${JSON.stringify(source)}`,
      )
    }
  }

  const bom = source.startsWith(BOM) ? 1 : 0
  const original = browserParse(source)
  const target = elementsOf(original)[index]
  if (!target) throw new Error(`no element at ${index}`)
  const [from = 0, to = 0] = windowOf(source.slice(bom), target, change).map(
    (offset) => Buffer.byteLength(source.slice(0, offset + bom)),
  )
  const sourceBytes = Buffer.from(source)
  const outputBytes = Buffer.from(output)
  if (!sourceBytes.equals(outputBytes)) {
    const [start, end] = changedSpan(sourceBytes, outputBytes)
    holds(
      start >= from && end <= to,
      `bytes ${start}-${end} changed outside ${from}-${to}`,
    )
  }

  const reparsed = browserParse(output)
  const elements = elementsOf(reparsed)
  holds(
    elements.length === elementsOf(original).length,
    'the element count moved',
  )
  const written = elements[index]
  if (!written || written.tagName !== target.tagName) {
    return holds(false, 'the target moved')
  }

  if (change.kind === 'text') {
    holds(textOf(written) === change.value, 'the text is not the value')
    target.childNodes = []
    if (change.value !== '') defaultTreeAdapter.insertText(target, change.value)
  } else if (change.kind === 'attribute') {
    holds(
      attributeOf(written, change.name) === change.value,
      'the attribute is not the value',
    )
    setAttributeOf(target, change.name, attributeIn(written, change.name))
  } else {
    const wanted = decodeStyle(attributeOf(target, 'style'))
    for (const longhand of SHORTHAND_LONGHANDS[change.property] ?? []) {
      delete wanted[longhand]
    }
    if (change.value.trim() === '') delete wanted[change.property]
    else wanted[change.property] = change.value.trim()
    holds(
      sorted(decodeStyle(attributeOf(written, 'style'))) === sorted(wanted),
      'the declarations are not the original with the one change',
    )
    setAttributeOf(target, 'style', attributeIn(written, 'style'))
  }
  holds(
    serialize(reparsed) === serialize(original),
    'the tree changed outside the target',
  )
}

const fixtures = readdirSync(FIXTURES)
  .filter((file) => file.endsWith('.html'))
  .sort()

const FIXTURE_CHANGES: readonly EditChange[] = [
  { kind: 'style', property: 'color', value: 'blue' },
  { kind: 'style', property: 'color', value: '' },
  { kind: 'style', property: 'font-family', value: "'Geist', serif" },
  { kind: 'attribute', name: 'title', value: 'a "q" & b' },
  { kind: 'text', value: 'Ship <it> & go' },
]

describe('applyEdit', () => {
  it.each(fixtures)(
    'should change only the edited span on every element of %s',
    (file) => {
      const source = readFileSync(new URL(file, FIXTURES), 'utf8')
      const count = elementsOf(browserParse(source)).length

      for (let index = 0; index < count; index += 1) {
        for (const change of FIXTURE_CHANGES) checkEdit(source, index, change)
      }

      expect(count).toBeGreaterThan(0)
    },
  )

  it(
    `should change only the edited span across ${RUNS} generated frames`,
    () => {
      const before = { ...made }

      fc.assert(
        fc.property(
          frameArbitrary,
          fc.nat(),
          changeArbitrary,
          (source, pick, change) => {
            const count = elementsOf(browserParse(source)).length
            checkEdit(source, pick % count, change)
          },
        ),
        { numRuns: RUNS, seed: SEED, endOnFailure: true },
      )

      // A writer refusing everything would pass the checks above vacuously.
      expect(made.style - before.style).toBeGreaterThan(RUNS / 10)
      expect(made.attribute - before.attribute).toBeGreaterThan(RUNS / 10)
      expect(made.text - before.text).toBeGreaterThan(RUNS / 40)
    },
    PROPERTY_TEST_TIMEOUT_MS,
  )
})
