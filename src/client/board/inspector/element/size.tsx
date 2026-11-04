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
import { type Axis, sizeDeclarations } from './size-declarations'
import type { LiveLayout } from './styles'
import type { PreviewStyle, WriteElement } from './write'

const WHOLE: Intl.NumberFormatOptions = { maximumFractionDigits: 0 }

const MODE_NAMES: Record<SizeMode, string> = {
  fixed: 'Fixed',
  hug: 'Hug',
  fill: 'Fill',
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
      // The writer refuses an edit with no declarations.
      if (declarations.length === 0) return Promise.resolve(false)
      return write({ kind: 'styles', declarations })
    }
    return (
      <div key={axis} className="relative">
        <NumberField
          label={label}
          prefix={axis === 'width' ? 'W' : 'H'}
          // Clears the mode trigger, so a four-digit size still shows whole.
          inputClassName="pr-[44px]"
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
            className="absolute inset-y-0 right-0 flex items-center gap-px rounded-r-md px-1 text-caption text-muted-foreground outline-none hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring/50 disabled:opacity-50"
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
