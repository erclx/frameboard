import { cn } from 'cn'
import { CircleAlert, Link2, Minus } from 'lucide-react'
import { type ReactNode, useEffect, useRef } from 'react'

import {
  DropdownMenu,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/client/components/ui/dropdown-menu'
import type { StyleValue } from '@/shared/records/elements'
import type { TokenRow } from '@/shared/records/tokens'
import type { Theme } from '@/shared/theme'

import { ChromeMenuContent, MENU_ROW } from '../../chrome/menu'
import { NumberField } from '../number-field'
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
}

const PERCENT: Intl.NumberFormatOptions = {
  style: 'unit',
  unit: 'percent',
  maximumFractionDigits: 0,
}

/**
 * The token-first color row of `inspector/text`. The swatch opens the
 * browser's color input and writes a raw value once it closes, the chip or
 * hex opens the project's color tokens, the percent writes fill opacity
 * and steps, and the link detaches a token to its value in the frame's
 * theme. A raw value carries the raw flag in place of the link, and the
 * minus after either removes the paint.
 */
export function ColorRow({
  label,
  value,
  tokens,
  theme,
  disabled,
  onWrite,
  onRemove,
}: ColorRowProps) {
  const source: ColorSource = value.token
    ? { token: value.token }
    : { raw: value.value }
  const detached = value.token ? tokenValue(tokens, value.token, theme) : null
  const swatch = swatchOf(value, tokens, theme)
  const mixable = value.token !== null || HEX.test(value.value)

  return (
    <div className={COLOR_ROW}>
      <ColorInput
        label={`${label} color`}
        color={swatch !== null && HEX.test(swatch) ? swatch : null}
        disabled={disabled}
        onPick={(hex) => onWrite(colorCss({ raw: hex }, value.percent))}
      >
        <Swatch color={swatch} />
      </ColorInput>
      <DropdownMenu>
        <DropdownMenuTrigger
          aria-label={`${label} token`}
          disabled={disabled || tokens.length === 0}
          className={cn(
            'min-w-0 truncate text-left outline-none focus-visible:ring-2 focus-visible:ring-ring/50 disabled:cursor-default',
            value.token ? TOKEN_CHIP : 'flex-1 tabular-nums',
          )}
        >
          {value.token ? chipName(value.token) : value.value.replace(/^#/, '')}
        </DropdownMenuTrigger>
        <ChromeMenuContent align="start" sideOffset={6} className="w-52">
          {tokens.map((row) => (
            <DropdownMenuItem
              key={row.name}
              className={MENU_ROW}
              onClick={() =>
                void onWrite(colorCss({ token: row.name }, value.percent))
              }
            >
              <Swatch color={row[theme]} />
              {chipName(row.name)}
            </DropdownMenuItem>
          ))}
        </ChromeMenuContent>
      </DropdownMenu>
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

interface ColorInputProps {
  label: string
  /** The hex the picker opens at, black when the color is not a hex. */
  color: string | null
  disabled: boolean
  onPick: (hex: string) => Promise<boolean>
  children: ReactNode
}

/**
 * The browser's color input behind the swatch. It writes once on `change`,
 * when the picker closes, rather than on every `input` while it drags,
 * which React's `onChange` would.
 */
function ColorInput({
  label,
  color,
  disabled,
  onPick,
  children,
}: ColorInputProps) {
  const input = useRef<HTMLInputElement>(null)
  const pick = useRef(onPick)
  useEffect(() => {
    pick.current = onPick
  })
  // Uncontrolled, so a drag inside the picker never re-renders the row.
  useEffect(() => {
    if (input.current) input.current.value = color ?? '#000000'
  }, [color])
  useEffect(() => {
    const element = input.current
    if (!element) return
    const changed = () => void pick.current(element.value)
    element.addEventListener('change', changed)
    return () => element.removeEventListener('change', changed)
  }, [])
  return (
    <label className="relative grid shrink-0 place-items-center">
      {children}
      <input
        ref={input}
        type="color"
        aria-label={label}
        disabled={disabled}
        className="absolute inset-0 size-full cursor-default opacity-0 disabled:pointer-events-none"
      />
    </label>
  )
}
