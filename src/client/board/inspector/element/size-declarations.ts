import type { SizeMode } from '@/shared/records/elements'

import type { LiveLayout } from './styles'

export type Axis = 'width' | 'height'

/** `align-items` values a child stretches across its flex parent under. */
const STRETCHING = new Set(['normal', 'stretch'])

type Declarations = { property: string; value: string }[]

/**
 * The declarations setting one axis to `to` on the child alone. Leaving Fill
 * puts back `flex`'s initial value or stops the stretch, since only a mode
 * declared on the child may be taken off by an edit.
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
    // A declared size, `fit-content` included, would block the stretch.
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
  // A null mode is an unread parent, so Hug clears everything that could size the child.
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
