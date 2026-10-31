import type { Element } from 'domhandler'

import type { Cascade } from '@/server/checks/cascade'
import { LAYOUT_PROPERTIES, layoutOf } from '@/server/edit/elements'
import type { ElementFlow, SizeMode } from '@/shared/records/elements'

/** What the flow read takes from the cascade, with the shorthands that set it. */
export const FLOW_PROPERTIES: ReadonlySet<string> = new Set([
  ...LAYOUT_PROPERTIES,
  'flex',
  'flex-grow',
  'flex-basis',
  'align-self',
  'align-items',
  'width',
  'height',
])

const HUGGING = new Set(['fit-content', 'max-content', 'min-content'])

/** `align-items` and `align-self` values a child stretches across the cross axis under. */
const STRETCHING = new Set(['normal', 'stretch'])

/**
 * The selected element's flow from a cascade built over `FLOW_PROPERTIES`:
 * the rule that makes it a container, so a shared one can be named, and
 * Fixed, Hug, or Fill per axis. Fill reads only under a flex parent, along
 * the main axis from a growing `flex`, across it from a stretch with no
 * declared size, as Figma offers Fill only inside auto layout.
 */
export function flowOf(cascade: Cascade, element: Element): ElementFlow {
  const container = layoutOf(cascade, element) !== 'block'
  const rule = container
    ? (cascade.specified(element, 'display')?.rule ?? null)
    : null
  const parent =
    element.parent?.type === 'tag' ? (element.parent as Element) : null
  const parentLayout = parent ? layoutOf(cascade, parent) : 'block'
  const flex = parentLayout === 'row' || parentLayout === 'column'
  const main = parentLayout === 'column' ? 'height' : 'width'
  const axis = (property: 'width' | 'height'): SizeMode | null => {
    const declared = declaredMode(cascade, element, property)
    if (!flex || !parent) {
      return declared ?? (property === 'height' ? 'hug' : null)
    }
    if (property === main) {
      if (grows(cascade, element)) return 'fill'
      return declared ?? (basisSet(cascade, element) ? 'fixed' : 'hug')
    }
    if (declared) return declared
    return stretches(cascade, element, parent) ? 'fill' : 'hug'
  }
  return { rule, size: { width: axis('width'), height: axis('height') } }
}

/** `fixed` for a declared length, `hug` for a content keyword, null for `auto` or nothing. */
function declaredMode(
  cascade: Cascade,
  element: Element,
  property: 'width' | 'height',
): SizeMode | null {
  const value = cascade.specified(element, property)?.value.trim().toLowerCase()
  if (!value || value === 'auto') return null
  return HUGGING.has(value) ? 'hug' : 'fixed'
}

/** Whether its `flex-grow`, written alone or through `flex`, is above zero. */
function grows(cascade: Cascade, element: Element): boolean {
  const found = cascade.specified(element, 'flex-grow')
  if (!found) return false
  const value = found.value.trim().toLowerCase()
  if (!found.shorthand) return Number(value) > 0
  if (value === 'none' || value === 'initial') return false
  if (value === 'auto') return true
  const [first = ''] = value.split(/\s+/)
  // A lone length in `flex` is its basis, with a grow of 1.
  return /^[\d.]+$/.test(first) ? Number(first) > 0 : true
}

/** Whether a `flex-basis` other than `auto` or `content` sizes its main axis. */
function basisSet(cascade: Cascade, element: Element): boolean {
  const found = cascade.specified(element, 'flex-basis')
  if (!found) return false
  const value = found.value.trim().toLowerCase()
  if (!found.shorthand) return value !== 'auto' && value !== 'content'
  const parts = value.split(/\s+/)
  const basis = parts.length === 3 ? parts[2] : undefined
  return basis !== undefined && basis !== 'auto' && basis !== 'content'
}

/** Whether it stretches across its flex parent, by its own `align-self` or else the parent's `align-items`. */
function stretches(
  cascade: Cascade,
  element: Element,
  parent: Element,
): boolean {
  const self = cascade
    .specified(element, 'align-self')
    ?.value.trim()
    .toLowerCase()
  if (self && self !== 'auto') return STRETCHING.has(self)
  const items = cascade
    .specified(parent, 'align-items')
    ?.value.trim()
    .toLowerCase()
  return !items || STRETCHING.has(items)
}
