import type { SizeMode } from '@/shared/records/elements'

import type { LiveLayout } from './styles'

export type Axis = 'width' | 'height'

/** `align-items` values a child stretches across its flex parent under. */
const STRETCHING = new Set(['normal', 'stretch'])

type Declarations = { property: string; value: string }[]

/**
 * The declarations that set one axis to `to` on the child alone, from the
 * mode the static read gives it. Fill writes `flex: 1 1 0` along a flex
 * parent's main axis and `align-self: stretch` across it, and leaving Fill
 * puts back the `flex` initial value or stops the stretch, since a mode
 * declared on the child is the only one an edit may take off.
 */
export function sizeDeclarations(
  layout: LiveLayout,
  axis: Axis,
  from: SizeMode | null,
  to: SizeMode,
  px?: number,
): Declarations {
  const flex =
    layout.parent === 'vertical' ||
    layout.parent === 'horizontal' ||
    layout.parent === 'wrap'
  const main = flex && (layout.parent === 'vertical') === (axis === 'height')
  const declarations: Declarations = []
  if (to === 'fixed') {
    declarations.push({
      property: axis,
      value: `${px ?? (axis === 'width' ? layout.width : layout.height)}px`,
    })
    if (main && from === 'fill') {
      declarations.push({ property: 'flex', value: '0 1 auto' })
    }
    return declarations
  }
  if (to === 'fill') {
    // A declared size holds the child at it, a `fit-content` Hug included, so
    // across the parent it would block the stretch.
    if (from === 'fixed' || (!main && from === 'hug')) {
      declarations.push({ property: axis, value: 'auto' })
    }
    declarations.push(
      main
        ? { property: 'flex', value: '1 1 0' }
        : { property: 'align-self', value: 'stretch' },
    )
    return declarations
  }
  if (!flex) {
    declarations.push({
      property: axis,
      value: axis === 'width' ? 'fit-content' : 'auto',
    })
    return declarations
  }
  // A null mode is a parent the static read could not see as flex, so Hug
  // writes everything that could be holding the child at another size.
  if (from === 'fixed' || from === null) {
    declarations.push({ property: axis, value: 'auto' })
  }
  if (main && (from === 'fill' || from === null)) {
    declarations.push({ property: 'flex', value: '0 1 auto' })
  }
  // An auto size across a stretching parent stretches, so Hug stops it.
  if (!main) {
    declarations.push({
      property: 'align-self',
      value: STRETCHING.has(layout.parentAlignItems) ? 'flex-start' : 'auto',
    })
  }
  return declarations
}
