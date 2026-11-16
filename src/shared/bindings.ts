/**
 * The drawn controls contract. A control is an ordinary input in a frame
 * carrying `data-binds="<selector> <--custom-property>"` and `data-unit`,
 * and the target's own CSS reads the property, so the frame file holds no
 * script and a kept value is plain CSS.
 */

export const BINDS_ATTRIBUTE = 'data-binds'
export const UNIT_ATTRIBUTE = 'data-unit'

/** What one `data-binds` names: the element it tunes and the property it sets there. */
export interface Binding {
  selector: string
  property: string
}

/**
 * A `data-binds` value read as its last word, the property, after a
 * selector that may itself hold spaces, as `.card img --blur` does. Null
 * when it holds fewer than two words.
 */
export function parseBinds(value: string): Binding | null {
  const words = value.trim().split(/\s+/)
  const property = words.pop()
  const selector = words.join(' ')
  if (!property || selector === '') return null
  return { selector, property }
}

/** Whether a property is a custom property, the one kind a control may set. */
export function isCustomProperty(property: string): boolean {
  return /^--./.test(property)
}

/** A moved control as the keep reads it, both indexes into the frame's file. */
export interface MovedControl {
  index: number
  value: string
  unit: string
  target: number
  property: string
}

/** One element's change in a keep, in the shape `POST /api/frames/edit` takes a batch's. */
export type KeepEdit =
  | {
      index: number
      change: { kind: 'attribute'; name: 'value'; value: string }
    }
  | {
      index: number
      change: {
        kind: 'styles'
        declarations: { property: string; value: string }[]
      }
    }

/**
 * The batch a keep posts: each moved control's `value` attribute, so a
 * reload shows the control where it was left, then one `styles` change per
 * target, since the edit route refuses a batch naming one element twice.
 * Two controls setting one property on one target keep the later control's
 * value, as the live page shows it.
 */
export function keepEdits(moved: readonly MovedControl[]): KeepEdit[] {
  const byTarget = new Map<number, Map<string, string>>()
  for (const { target, property, value, unit } of moved) {
    const declarations = byTarget.get(target) ?? new Map<string, string>()
    declarations.set(property, `${value}${unit}`)
    byTarget.set(target, declarations)
  }
  return [
    ...moved.map(({ index, value }) => ({
      index,
      change: { kind: 'attribute' as const, name: 'value' as const, value },
    })),
    ...[...byTarget].map(([index, declarations]) => ({
      index,
      change: {
        kind: 'styles' as const,
        declarations: [...declarations].map(([property, value]) => ({
          property,
          value,
        })),
      },
    })),
  ]
}

/**
 * Hides every control wherever a frame leaves the canvas, being an export,
 * a thumbnail, a presented slide, and the phone link: the control, a label
 * holding one, and a container holding only controls and their labels, so
 * the design ships as if the controls were never drawn.
 */
export const HIDE_CONTROLS_CSS = `[${BINDS_ATTRIBUTE}], label:has([${BINDS_ATTRIBUTE}]), :not(html, body):has(> [${BINDS_ATTRIBUTE}], > label > [${BINDS_ATTRIBUTE}]):not(:has(> :not([${BINDS_ATTRIBUTE}], label))) { display: none !important }`
