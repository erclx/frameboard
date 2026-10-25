import { cn } from 'cn'
import { CircleAlert, Link2, Minus } from 'lucide-react'
import { useRef, useState } from 'react'

import { Popover, PopoverContent } from '@/client/components/ui/popover'
import type { StyleValue } from '@/shared/records/elements'
import type { TokenRow } from '@/shared/records/tokens'
import type { Theme } from '@/shared/theme'

import { NumberField } from '../number-field'
import {
  ColorPickerPanel,
  type PickedColor,
  type PickerTab,
} from './color-picker/panel'
import { hsvToRgb, resolveColor, toHex } from './color-picker/space'
import {
  chipName,
  COLOR_ROW,
  colorCss,
  type ColorSource,
  HEX,
  swatchOf,
  TOKEN_CHIP,
  tokenValue,
} from './values'

export function Swatch({
  color,
  className,
}: {
  color: string | null
  className?: string
}) {
  return (
    <span
      aria-hidden
      className={cn(
        'size-3.5 shrink-0 rounded-[3px] shadow-[inset_0_0_0_1px_rgba(127,127,127,.3)]',
        color === null && 'border border-dashed border-faint',
        className,
      )}
      style={color === null ? undefined : { background: color }}
    />
  )
}

/** The mark on a raw value, which no token names. */
export function RawFlag() {
  return (
    <span role="img" aria-label="Raw value, not a token" title="Raw value">
      <CircleAlert aria-hidden className="size-[13px] text-note" />
    </span>
  )
}

interface ColorRowProps {
  /** Names the row's controls, such as `Fill` or `Stroke`. */
  label: string
  value: StyleValue
  /** The project's color tokens, offered first. */
  tokens: readonly TokenRow[]
  /** The theme the frame shows, which a swatch and a detach read. */
  theme: Theme
  disabled: boolean
  /** Writes the property's new value and answers whether it was written. */
  onWrite: (css: string) => Promise<boolean>
  /** Removes the paint, absent where the row has nothing it may remove. */
  onRemove?: () => void
  /** Shows a color on the live element while the picker is open, or puts the stored one back on null. */
  onPreview?: (css: string | null) => void
  /** The element's text color, which a `currentcolor` paint shows. */
  currentColor?: string
}

/** A picker session: the color it opened at and the one it holds now. */
interface Picking {
  tab: PickerTab
  from: PickedColor
  color: PickedColor
}

const BLACK: PickedColor = { hsv: { h: 0, s: 0, v: 0 }, percent: 100 }

/** The raw CSS a picked color writes, an 8-digit hex below 100 percent. */
function pickedCss({ hsv, percent }: PickedColor): string {
  return colorCss({ raw: `#${toHex(hsvToRgb(hsv)).toLowerCase()}` }, percent)
}

const PERCENT: Intl.NumberFormatOptions = {
  style: 'unit',
  unit: 'percent',
  maximumFractionDigits: 0,
}

/**
 * The token-first color row of `inspector/text`. The swatch opens the
 * picker on Custom and the chip or hex on Tokens, the percent writes fill
 * opacity and steps, and the link detaches a token to its value in the
 * frame's theme. A raw value carries the raw flag in place of the link, and
 * the minus after either removes the paint.
 *
 * The picker previews a custom color while open and writes it once as it
 * closes, or on Enter in its hex field, and Esc puts the stored color back
 * and writes nothing. A token writes at once and closes it.
 */
export function ColorRow({
  label,
  value,
  tokens,
  theme,
  disabled,
  onWrite,
  onRemove,
  onPreview,
  currentColor,
}: ColorRowProps) {
  const row = useRef<HTMLDivElement>(null)
  const [picking, setPicking] = useState<Picking | null>(null)
  const source: ColorSource = value.token
    ? { token: value.token }
    : { raw: value.value }
  const detached = value.token ? tokenValue(tokens, value.token, theme) : null
  const swatch = swatchOf(value, tokens, theme)
  const mixable = value.token !== null || HEX.test(value.value)

  const open = (tab: PickerTab) => {
    const base = value.token ? detached : value.value
    const css =
      base?.trim().toLowerCase() === 'currentcolor'
        ? (currentColor ?? base)
        : base
    const hsv = css && row.current ? resolveColor(css, row.current) : null
    const from = hsv ? { hsv, percent: value.percent } : BLACK
    setPicking({ tab, from, color: from })
  }

  const close = (write: boolean) => {
    if (!picking) return
    setPicking(null)
    const css = pickedCss(picking.color)
    if (css === pickedCss(picking.from)) return
    if (!write) {
      onPreview?.(null)
      return
    }
    void onWrite(css).then((written) => {
      if (!written) onPreview?.(null)
    })
  }

  const pickToken = (name: string) => {
    const percent = picking?.color.percent ?? value.percent
    setPicking(null)
    onPreview?.(null)
    void onWrite(colorCss({ token: name }, percent))
  }

  return (
    <div ref={row} className={COLOR_ROW}>
      <button
        type="button"
        aria-label={`${label} color`}
        disabled={disabled}
        onClick={() => open('custom')}
        className="grid shrink-0 place-items-center rounded-[3px] outline-none focus-visible:ring-2 focus-visible:ring-ring/50"
      >
        <Swatch color={swatch} />
      </button>
      <button
        type="button"
        aria-label={`${label} token`}
        disabled={disabled}
        onClick={() => open('tokens')}
        className={cn(
          'min-w-0 truncate text-left outline-none focus-visible:ring-2 focus-visible:ring-ring/50 disabled:cursor-default',
          value.token ? TOKEN_CHIP : 'flex-1 tabular-nums',
        )}
      >
        {value.token ? chipName(value.token) : value.value.replace(/^#/, '')}
      </button>
      <Popover
        open={picking !== null}
        onOpenChange={(next, details) => {
          if (!next) close(details.reason !== 'escape-key')
        }}
      >
        <PopoverContent
          anchor={row}
          side="left"
          align="start"
          sideOffset={12}
          aria-label={`${label} color picker`}
          className="w-[248px] gap-0 rounded-xl p-2.5 text-xs shadow-[0_14px_40px_rgba(0,0,0,.28)]"
        >
          {picking ? (
            <ColorPickerPanel
              label={label}
              color={picking.color}
              onColor={(color) => {
                setPicking({ ...picking, color })
                onPreview?.(pickedCss(color))
              }}
              onSubmit={() => close(true)}
              tab={picking.tab}
              onTab={(tab) => setPicking({ ...picking, tab })}
              tokens={tokens}
              theme={theme}
              token={value.token}
              onToken={pickToken}
            />
          ) : null}
        </PopoverContent>
      </Popover>
      <NumberField
        label={`${label} opacity`}
        className="ml-auto w-12 shrink-0"
        inputClassName="h-6 px-0 text-right text-muted-foreground focus-visible:text-foreground"
        value={value.percent}
        min={0}
        max={100}
        format={PERCENT}
        disabled={disabled || !mixable}
        onCommit={(change) => onWrite(colorCss(source, change(value.percent)))}
      />
      {value.token ? (
        <button
          type="button"
          aria-label={`Detach ${chipName(value.token)}`}
          title="Detach the token to its value"
          disabled={disabled || detached === null}
          onClick={() => {
            if (detached !== null) {
              void onWrite(colorCss({ raw: detached }, value.percent))
            }
          }}
          className="grid shrink-0 place-items-center rounded-sm text-muted-foreground outline-none hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring/50 disabled:opacity-50"
        >
          <Link2 aria-hidden className="size-[13px]" />
        </button>
      ) : (
        <RawFlag />
      )}
      {onRemove ? (
        <button
          type="button"
          aria-label={`Remove ${label.toLowerCase()}`}
          title={`Remove the ${label.toLowerCase()}`}
          disabled={disabled}
          onClick={onRemove}
          className="grid shrink-0 place-items-center rounded-sm text-muted-foreground outline-none hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring/50 disabled:opacity-50"
        >
          <Minus aria-hidden className="size-[13px]" />
        </button>
      ) : null}
    </div>
  )
}
