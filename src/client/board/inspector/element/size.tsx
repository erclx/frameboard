import { ChevronDown } from 'lucide-react'

import {
  DropdownMenu,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuTrigger,
} from '@/client/components/ui/dropdown-menu'
import type { ElementFlow, SizeMode } from '@/shared/records/elements'

import { ChromeMenuContent, MENU_ROW } from '../../chrome/menu'
import { NumberField } from '../number-field'
import type { LiveLayout } from './styles'
import type { PreviewStyle, WriteElement } from './write'

const WHOLE: Intl.NumberFormatOptions = { maximumFractionDigits: 0 }

type Axis = 'width' | 'height'

const MODE_NAMES: Record<SizeMode, string> = {
  fixed: 'Fixed',
  hug: 'Hug',
  fill: 'Fill',
}

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
function sizeDeclarations(
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
    if (from === 'fixed') declarations.push({ property: axis, value: 'auto' })
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
  if (from === 'fixed') declarations.push({ property: axis, value: 'auto' })
  if (main && from === 'fill') {
    declarations.push({ property: 'flex', value: '0 1 auto' })
  }
  if (!main && from === 'fill') {
    declarations.push({
      property: 'align-self',
      value: STRETCHING.has(layout.parentAlignItems) ? 'flex-start' : 'auto',
    })
  }
  return declarations
}

interface SizeRowProps {
  layout: LiveLayout
  /** Each axis's mode from the static read, null until it answers. */
  size: ElementFlow['size'] | null
  disabled: boolean
  write: WriteElement
  preview?: PreviewStyle
}

/**
 * The element's W and H in px, each with its Fixed, Hug, or Fill menu. A
 * typed or scrubbed value writes Fixed. Fill is offered only under a flex
 * parent, as Figma offers it only inside auto layout, so a block parent's
 * child takes Fixed and Hug, and Add flow on the parent reaches Fill.
 */
export function SizeRow({
  layout,
  size,
  disabled,
  write,
  preview,
}: SizeRowProps) {
  const flex =
    layout.parent === 'vertical' ||
    layout.parent === 'horizontal' ||
    layout.parent === 'wrap'
  const modes: readonly SizeMode[] = flex
    ? ['fixed', 'hug', 'fill']
    : ['fixed', 'hug']
  const axisField = (axis: Axis) => {
    const value = axis === 'width' ? layout.width : layout.height
    const mode = size?.[axis] ?? null
    const label = axis === 'width' ? 'Width' : 'Height'
    const send = (to: SizeMode, px?: number) => {
      const declarations = sizeDeclarations(layout, axis, mode, to, px)
      return write({ kind: 'styles', declarations })
    }
    return (
      <div key={axis} className="relative">
        <NumberField
          label={label}
          prefix={axis === 'width' ? 'W' : 'H'}
          inputClassName="pr-14"
          value={value}
          min={0}
          format={WHOLE}
          disabled={disabled}
          onPreview={(change) =>
            preview?.(axis, change ? `${Math.max(0, change(value))}px` : null)
          }
          onCommit={(change) => send('fixed', Math.max(0, change(value)))}
        />
        <DropdownMenu>
          <DropdownMenuTrigger
            aria-label={`${label} mode`}
            disabled={disabled || size === null}
            className="absolute inset-y-0 right-0 flex items-center gap-0.5 rounded-r-md px-1.5 text-muted-foreground outline-none hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring/50 disabled:opacity-50"
          >
            {mode ? MODE_NAMES[mode] : 'Auto'}
            <ChevronDown aria-hidden className="size-2.5" />
          </DropdownMenuTrigger>
          <ChromeMenuContent align="end" sideOffset={6} className="w-auto">
            <DropdownMenuRadioGroup
              value={mode}
              onValueChange={(next: SizeMode) => {
                if (next !== mode) void send(next)
              }}
            >
              {modes.map((option) => (
                <DropdownMenuRadioItem
                  key={option}
                  value={option}
                  closeOnClick
                  className={`${MENU_ROW} pr-8`}
                >
                  {MODE_NAMES[option]}
                </DropdownMenuRadioItem>
              ))}
            </DropdownMenuRadioGroup>
          </ChromeMenuContent>
        </DropdownMenu>
      </div>
    )
  }
  return (
    <>
      <p className="mt-1.5 mb-[3px] ml-0.5 text-caption text-muted-foreground">
        Size
      </p>
      <div className="grid grid-cols-2 gap-1.5">
        {axisField('width')}
        {axisField('height')}
      </div>
    </>
  )
}
