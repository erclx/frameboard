import type { Element as SheetElement } from 'domhandler'
import postcss, { type Container, type Declaration, Rule } from 'postcss'

import { buildCascade, compileSelector, styles } from '@/server/checks/cascade'
import type { FrameSource, Sheet } from '@/server/checks/frame-source'
import { SHOWN_DISPLAY_ATTRIBUTE } from '@/shared/element-marks'

import { type Element, parseFrame } from './address'
import { type AppliedEdit, applyEdit, type EditChange, refuse } from './apply'
import { spanText } from './element-span'
import { declaredValues } from './style'

/** Whether the element at `index` of `html` may still draw, its `hidden` attribute and inline `display` as `html` states them. */
export type MayShow = (html: string, index: number) => boolean

const DISPLAY: ReadonlySet<string> = new Set(['display', 'all'])

const XHTML = 'http://www.w3.org/1999/xhtml'

const PSEUDO_ELEMENT = /::|:(?:before|after|first-line|first-letter)\b/i

const NONE = /^\s*none\b/i

/**
 * Hides an element or shows it again by its start tag. A hide states `hidden`,
 * and where the page could draw the element through that, an inline
 * `display: none` over the display it keeps for the show.
 */
export function hideElement(
  source: string,
  index: number,
  hidden: boolean,
  mayShow: MayShow,
): AppliedEdit {
  const { elements } = parseFrame(source)
  const element = elements[index]
  if (!element) {
    return refuse(
      'invalid-address',
      `the frame holds elements 0 to ${elements.length - 1}, so ${index} names none`,
    )
  }
  let html = source
  for (const changes of hidden ? hides(element) : [shows(element)]) {
    for (const change of changes) {
      const applied = applyEdit(html, { index }, change)
      if (!applied.ok) return applied
      html = applied.html
    }
    if (hidden && !mayShow(html, index)) break
  }
  const written = parseFrame(html).elements[index] ?? element
  return {
    ok: true,
    html,
    span: {
      scope: 'start-tag',
      index,
      count: elements.length,
      before: spanText(source, element, 'start-tag'),
      after: spanText(html, written, 'start-tag'),
    },
  }
}

/** What a hide writes step by step, each step only where the one before left the element drawing. */
function hides(element: Element): EditChange[][] {
  const stated = attribute(element, 'hidden')?.toLowerCase()
  const display = inlineDisplay(element)
  const none = { kind: 'style', property: 'display' } as const
  return [
    // `until-found` leaves the element to show again by itself.
    stated === undefined || stated === 'until-found'
      ? [{ kind: 'attribute', name: 'hidden', value: '' }]
      : [],
    [
      ...(display === undefined || NONE.test(display)
        ? []
        : [
            {
              kind: 'attribute',
              name: SHOWN_DISPLAY_ATTRIBUTE,
              value: display,
            } as const,
          ]),
      { ...none, value: 'none' },
    ],
    [{ ...none, value: 'none !important' }],
  ]
}

function shows(element: Element): EditChange[] {
  const kept = attribute(element, SHOWN_DISPLAY_ATTRIBUTE)
  const changes: EditChange[] = []
  if (attribute(element, 'hidden') !== undefined) {
    changes.push({ kind: 'attribute', name: 'hidden', remove: true })
  }
  if (NONE.test(inlineDisplay(element) ?? '')) {
    changes.push({ kind: 'style', property: 'display', value: kept ?? '' })
  }
  if (kept !== undefined) {
    changes.push({
      kind: 'attribute',
      name: SHOWN_DISPLAY_ATTRIBUTE,
      remove: true,
    })
  }
  return changes
}

/** The inline `display` that applies, with any `!important`. */
function inlineDisplay(element: Element): string | undefined {
  return declaredValues(attribute(element, 'style') ?? '', 'display').at(-1)
}

function attribute(element: Element, name: string): string | undefined {
  return element.attrs.find((attr) => attr.name === name)?.value
}

/**
 * Whether an element may draw with its `hidden` attribute and inline `display`
 * as written, true wherever the static cascade cannot rule it out.
 */
export function mayShow(
  source: FrameSource,
  tokens: Sheet[],
  index: number,
): boolean {
  const element = source.elements[index]
  if (!element) return false
  const cascade = buildCascade(source, tokens, { properties: DISPLAY })
  const display = cascade.specified(element, 'display')
  if (display) {
    // A rule's none may sit in a media query, so only one for `[hidden]` settles it.
    const settled =
      display.rule === null || /\[hidden/i.test(display.rule.selector)
    return !(settled && NONE.test(display.value))
  }
  return (
    cascade.declares(element, 'display') ||
    cascade.declares(element, 'all') ||
    !hiddenByBrowser(element) ||
    [...tokens, ...source.sheets].some(setsDisplayUnread)
  )
}

/** Whether each element's `hidden` attribute hides it, by the edit index. */
export function elementHidden(source: FrameSource, tokens: Sheet[]): boolean[] {
  const stated = source.elements.map(
    (element) => element.attribs.hidden !== undefined,
  )
  if (!stated.includes(true)) return stated
  const cascade = buildCascade(source, tokens, { properties: DISPLAY })
  return source.elements.map((element, at) => {
    if (!stated[at]) return false
    const display = cascade.specified(element, 'display')
    return display
      ? NONE.test(display.value)
      : hiddenByBrowser(element) && !cascade.declares(element, 'display')
  })
}

/** Whether the browser's own `[hidden]` rule hides it, which reaches no SVG and loses to a custom element's shadow styles. */
function hiddenByBrowser(element: SheetElement): boolean {
  return (element.namespace ?? XHTML) === XHTML && !element.name.includes('-')
}

/** Whether a sheet sets `display` by a rule the static cascade reads past, such as a nested one or a `:hover`. */
function setsDisplayUnread({ css }: Sheet): boolean {
  let root
  try {
    root = postcss.parse(css)
  } catch {
    return true
  }
  let unread = false
  root.walkDecls(/^(?:display|all)$/i, (declaration) => {
    unread ||= isUnread(declaration)
  })
  return unread
}

function isUnread(declaration: Declaration): boolean {
  const parent = declaration.parent as Container | undefined
  const rule = parent instanceof Rule ? parent : null
  const around: postcss.Node | undefined = rule ? rule.parent : parent
  for (let at = around; at; at = at.parent) {
    if (at instanceof Rule) return true
  }
  return (
    rule !== null &&
    styles(rule) &&
    rule.selectors.some(
      (selector) =>
        !PSEUDO_ELEMENT.test(selector) && compileSelector(selector) === null,
    )
  )
}
