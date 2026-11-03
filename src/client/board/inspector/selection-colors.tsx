import { cn } from 'cn'
import { Link2 } from 'lucide-react'
import { useRef, useState } from 'react'

import { Popover, PopoverContent } from '@/client/components/ui/popover'
import { toast } from '@/client/components/ui/toast'
import type { StyleValue } from '@/shared/records/elements'
import type { TokenRow } from '@/shared/records/tokens'
import type { Theme } from '@/shared/theme'

import {
  parseComputed,
  parseHex,
  type Rgba,
} from './element/color-picker/space'
import { RawFlag, Swatch } from './element/color-row'
import {
  chipName,
  COLOR_ROW,
  SWATCH_RING,
  swatchOf,
  TOKEN_CHIP,
  tokenValue,
} from './element/values'

/** The rows the list shows before `Show all`, so the section never pushes the panel's foot out of reach. */
const CAP = 5

interface SelectionColorsProps {
  /** The colors the selection uses, deduplicated, each with its token or none. */
  colors: readonly StyleValue[]
  tokens: readonly TokenRow[]
  theme: Theme
  /**
   * Replaces a raw color with a token across the selection, absent where
   * the selection cannot take one, so a raw row's swatch opens nothing.
   */
  onReplace?: (color: StyleValue, token: string) => void
}

/**
 * Selection colors: one row per color the selection uses, raw values first
 * since they are the ones to replace, capped at five rows until `Show all`.
 * A row shows its swatch, its token chip or raw hex, its percent, and the
 * link on a token or the raw flag on a value no token names, and pressing it
 * copies the hex or the token's `var()`. A raw row's swatch is its own button
 * opening the project's color tokens, nearest value first, and a pick
 * replaces the value with that token. A caller keys it by the selection, so
 * a new selection caps the list again.
 */
export function SelectionColors({
  colors,
  tokens,
  theme,
  onReplace,
}: SelectionColorsProps) {
  const [open, setOpen] = useState(false)
  if (colors.length === 0) return null
  const ordered = [
    ...colors.filter((color) => !color.token),
    ...colors.filter((color) => color.token),
  ]
  const shown = open ? ordered : ordered.slice(0, CAP)
  return (
    <section
      aria-labelledby="inspector-selection-colors"
      className="border-b border-sidebar-border px-3 pt-2.5 pb-3"
    >
      <h2
        id="inspector-selection-colors"
        className="mb-2 text-xs font-semibold"
      >
        Selection colors · {colors.length}
      </h2>
      <ul className="flex flex-col gap-1.5">
        {shown.map((color) => (
          <li key={`${color.token ?? color.value}:${color.percent}`}>
            {color.token || !onReplace ? (
              <ColorButton
                color={color}
                swatch={swatchOf(color, tokens, theme)}
              />
            ) : (
              <RawColorRow
                color={color}
                tokens={tokens}
                theme={theme}
                onReplace={(token) => onReplace(color, token)}
              />
            )}
          </li>
        ))}
      </ul>
      {shown.length < ordered.length ? (
        <button
          type="button"
          onClick={() => setOpen(true)}
          className="mt-1.5 h-[22px] rounded-sm text-muted-foreground outline-none hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring/50"
        >
          Show all {ordered.length}
        </button>
      ) : null}
    </section>
  )
}

/** What a row copies: a raw value as written, a token as the `var()` a stylesheet names it by. */
function copyText(color: StyleValue): string {
  return color.token ? `var(${color.token})` : color.value
}

/** Copies a row's value and says so in a toast. */
function copy(text: string): void {
  navigator.clipboard.writeText(text).then(
    () =>
      toast.add({
        title: `Copied ${text}`,
        type: 'success',
        timeout: 2000,
      }),
    (error: unknown) =>
      toast.add({
        title: 'Nothing was copied',
        description: error instanceof Error ? error.message : String(error),
        type: 'error',
      }),
  )
}

function ColorButton({
  color,
  swatch,
}: {
  color: StyleValue
  swatch: string | null
}) {
  const text = copyText(color)
  return (
    <button
      type="button"
      aria-label={`Copy ${text}`}
      onClick={() => copy(text)}
      className={cn(
        COLOR_ROW,
        'w-full text-left outline-none hover:bg-accent focus-visible:ring-2 focus-visible:ring-ring/50',
      )}
    >
      <Swatch color={swatch} />
      {color.token ? (
        <span className={TOKEN_CHIP}>{chipName(color.token)}</span>
      ) : (
        <span className="min-w-0 flex-1 truncate tabular-nums">
          {color.value.replace(/^#/, '')}
        </span>
      )}
      <span className="ml-auto text-muted-foreground tabular-nums">
        {color.percent}%
      </span>
      {color.token ? (
        <Link2
          role="img"
          aria-label="Token"
          className="size-[13px] shrink-0 text-muted-foreground"
        />
      ) : (
        <RawFlag />
      )}
    </button>
  )
}

/**
 * A raw row whose swatch and copy are sibling buttons, since the swatch opens
 * the token list a button cannot hold. The row keeps one shell and one hover.
 */
function RawColorRow({
  color,
  tokens,
  theme,
  onReplace,
}: {
  color: StyleValue
  tokens: readonly TokenRow[]
  theme: Theme
  onReplace: (token: string) => void
}) {
  const row = useRef<HTMLDivElement>(null)
  const [open, setOpen] = useState(false)
  const shown = color.value.replace(/^#/, '')
  return (
    <div ref={row} className={cn(COLOR_ROW, 'hover:bg-accent')}>
      <button
        type="button"
        aria-label={`Replace ${shown} with a token`}
        aria-haspopup="dialog"
        aria-expanded={open}
        onClick={() => setOpen(true)}
        className="grid shrink-0 place-items-center rounded-[3px] outline-none focus-visible:ring-2 focus-visible:ring-ring/50"
      >
        <Swatch color={swatchOf(color, tokens, theme)} />
      </button>
      <button
        type="button"
        aria-label={`Copy ${color.value}`}
        onClick={() => copy(color.value)}
        className="flex h-full min-w-0 flex-1 items-center gap-2 rounded-sm text-left outline-none focus-visible:ring-2 focus-visible:ring-ring/50"
      >
        <span className="min-w-0 flex-1 truncate tabular-nums">{shown}</span>
        <span className="ml-auto text-muted-foreground tabular-nums">
          {color.percent}%
        </span>
        <RawFlag />
      </button>
      <Popover open={open} onOpenChange={setOpen}>
        <PopoverContent
          anchor={row}
          side="left"
          align="start"
          sideOffset={12}
          aria-label={`Replace ${shown}`}
          className="w-[230px] gap-0 rounded-xl p-2 text-xs shadow-[0_14px_40px_rgba(0,0,0,.28)]"
        >
          <p className="mb-1.5 px-1 text-muted-foreground">
            Replace {shown} with
          </p>
          {tokens.length === 0 ? (
            <p className="px-1 pb-1">
              This project names no color tokens. Add one in the Theme tab.
            </p>
          ) : (
            <ul
              aria-label={`Tokens to replace ${shown} with`}
              className="flex max-h-56 flex-col gap-1 overflow-y-auto"
            >
              {nearestFirst(color.value, tokens, theme).map((token) => (
                <li key={token.name}>
                  <button
                    type="button"
                    onClick={() => {
                      setOpen(false)
                      onReplace(token.name)
                    }}
                    className="flex h-7 w-full items-center gap-2 rounded-md px-1.5 text-left outline-none hover:bg-accent focus-visible:ring-2 focus-visible:ring-ring/50"
                  >
                    <span
                      aria-hidden
                      className={cn(
                        'size-3.5 shrink-0 rounded-[3px]',
                        SWATCH_RING,
                      )}
                      style={{ background: token[theme] ?? undefined }}
                    />
                    <span className={TOKEN_CHIP}>{chipName(token.name)}</span>
                    <span className="ml-auto truncate text-muted-foreground tabular-nums">
                      {token[theme]?.replace(/^#/, '') ?? ''}
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </PopoverContent>
      </Popover>
    </div>
  )
}

function rgbOf(css: string | null): Rgba | null {
  if (css === null) return null
  return parseHex(css) ?? parseComputed(css)
}

/**
 * The color tokens by how near their value in the theme sits to `value`,
 * nearest first, so the likely match tops the list. A token whose value is
 * no hex or `rgb()` keeps its place after every one that is.
 */
function nearestFirst(
  value: string,
  tokens: readonly TokenRow[],
  theme: Theme,
): TokenRow[] {
  const from = rgbOf(value)
  const distance = (token: TokenRow): number => {
    const to = rgbOf(tokenValue(tokens, token.name, theme))
    if (!from || !to) return Number.POSITIVE_INFINITY
    return (from.r - to.r) ** 2 + (from.g - to.g) ** 2 + (from.b - to.b) ** 2
  }
  const ranked = tokens.map((token) => ({ token, at: distance(token) }))
  // Two unreadable values compare equal, since Infinity minus Infinity is NaN.
  return ranked
    .toSorted((one, other) => (one.at === other.at ? 0 : one.at - other.at))
    .map(({ token }) => token)
}
