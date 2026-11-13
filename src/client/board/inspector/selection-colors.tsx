import { Link2 } from 'lucide-react'
import { type ReactNode, useRef, useState } from 'react'

import { Popover, PopoverContent } from '@/client/components/ui/popover'
import { toast } from '@/client/components/ui/toast'
import { cn } from '@/client/lib/cn'
import type { UsedColor } from '@/shared/records/elements'
import type { TokenRow } from '@/shared/records/tokens'
import type { Theme } from '@/shared/theme'

import { selectElements, selectionStore } from '../selection'
import {
  parseComputed,
  parseHex,
  type Rgba,
} from './element/color-picker/space'
import { Swatch, UseToken } from './element/color-row'
import {
  chipName,
  COLOR_ROW,
  matchingToken,
  SWATCH_RING,
  swatchOf,
  TOKEN_CHIP,
  tokenValue,
} from './element/values'

/** The rows the list shows before `Show all`, so the section never pushes the panel's foot out of reach. */
const CAP = 5

/** The frame and bytes a color read's `uses` index into, on the page showing them. */
interface SelectIn {
  page: string
  frame: string
  hash: string
}

interface SelectionColorsProps {
  /** The colors the selection uses, deduplicated, each with its token or none. */
  colors: readonly UsedColor[]
  tokens: readonly TokenRow[]
  theme: Theme
  /**
   * Replaces a raw color with a token across the selection, absent where
   * the selection cannot take one, so a raw row's swatch opens nothing.
   */
  onReplace?: (color: UsedColor, token: string) => void
  /**
   * Where a row's Select lands, absent where the colors span frames or bytes,
   * since one selection holds one frame's elements at one hash.
   */
  selectIn?: SelectIn
}

/**
 * Selection colors: one row per color the selection uses, raw values first
 * since they are the ones to replace, capped at five rows until `Show all`.
 * A row shows its swatch, its token chip or raw hex, its percent, and the
 * link on a token, and pressing it copies the hex or the token's `var()`.
 * A raw value equal to a token offers `Use <token>` after its percent where
 * the selection can take a replace. A raw row's swatch is its own button
 * opening the project's color tokens, nearest value first, and a pick
 * replaces the value with that token. A Select over the row's end on hover
 * and keyboard focus selects the elements using the color. A caller keys it
 * by the selection, so a new selection caps the list again.
 */
export function SelectionColors({
  colors,
  tokens,
  theme,
  onReplace,
  selectIn,
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
        {shown.map((color) => {
          const select = selectIn ? (
            <SelectButton color={color} selectIn={selectIn} />
          ) : null
          return (
            <li key={`${color.token ?? color.value}:${color.percent}`}>
              {color.token || !onReplace ? (
                <ColorButton
                  color={color}
                  swatch={swatchOf(color, tokens, theme)}
                  select={select}
                />
              ) : (
                <RawColorRow
                  color={color}
                  tokens={tokens}
                  theme={theme}
                  onReplace={(token) => onReplace(color, token)}
                  select={select}
                />
              )}
            </li>
          )
        })}
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
function copyText(color: UsedColor): string {
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

/** A color as the row shows it, with the percent only where it keeps less than all of it. */
function colorName(color: UsedColor): string {
  const name = color.token
    ? chipName(color.token)
    : color.value.replace(/^#/, '')
  return color.percent === 100 ? name : `${name} ${color.percent}%`
}

/**
 * Selects the elements using a row's color, covering the row's percent and
 * mark while it shows. Nothing draws for a color no selectable element uses,
 * as a `body`'s own fill.
 */
function SelectButton({
  color,
  selectIn,
}: {
  color: UsedColor
  selectIn: SelectIn
}) {
  const uses = color.uses ?? []
  if (uses.length === 0) return null
  const { page, frame, hash } = selectIn
  const name = colorName(color)
  return (
    <button
      type="button"
      aria-label={`Select ${uses.length} ${uses.length === 1 ? 'element' : 'elements'} using ${name}`}
      onClick={() =>
        selectElements(
          selectionStore,
          page,
          uses.map((index) => ({ frame, index, hash })),
          name,
        )
      }
      className="absolute inset-y-px right-px w-[60px] rounded-[5px] bg-inherit opacity-0 outline-none group-hover:opacity-100 group-has-[:focus-visible]:opacity-100 hover:bg-sidebar focus-visible:ring-2 focus-visible:ring-ring/50 active:bg-sidebar"
    >
      Select
    </button>
  )
}

function ColorButton({
  color,
  swatch,
  select,
}: {
  color: UsedColor
  swatch: string | null
  select: ReactNode
}) {
  const text = copyText(color)
  return (
    <div className={cn(COLOR_ROW, 'group relative px-0 hover:bg-accent')}>
      <button
        type="button"
        aria-label={`Copy ${text}`}
        onClick={() => copy(text)}
        className="flex size-full min-w-0 items-center gap-2 rounded-md px-2 text-left outline-none focus-visible:ring-2 focus-visible:ring-ring/50"
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
        ) : null}
      </button>
      {select}
    </div>
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
  select,
}: {
  color: UsedColor
  tokens: readonly TokenRow[]
  theme: Theme
  onReplace: (token: string) => void
  select: ReactNode
}) {
  const row = useRef<HTMLDivElement>(null)
  const swatch = useRef<HTMLButtonElement>(null)
  const [open, setOpen] = useState(false)
  // The pick waits for the list to finish closing, since the replace turns
  // this row into a token row and unmounting a closing popup strands focus
  // inside it, where no board key fires.
  const picked = useRef<string | null>(null)
  const shown = color.value.replace(/^#/, '')
  const match = matchingToken(color.value, tokens, theme)
  return (
    <div ref={row} className={cn(COLOR_ROW, 'group relative hover:bg-accent')}>
      <button
        ref={swatch}
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
      </button>
      {/* Select covers the percent alone here, so the swap after it stays in reach. */}
      <span className="relative flex shrink-0 items-center self-stretch bg-inherit">
        <span className="text-muted-foreground tabular-nums">
          {color.percent}%
        </span>
        {select}
      </span>
      {match ? (
        <UseToken
          token={match.name}
          shown={color.value}
          onUse={() => onReplace(match.name)}
        />
      ) : null}
      <Popover
        open={open}
        onOpenChange={setOpen}
        onOpenChangeComplete={(isOpen) => {
          const token = picked.current
          picked.current = null
          if (!isOpen && token !== null) onReplace(token)
        }}
      >
        <PopoverContent
          anchor={row}
          side="left"
          align="start"
          sideOffset={12}
          aria-label={`Replace ${shown}`}
          finalFocus={swatch}
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
                      picked.current = token.name
                      setOpen(false)
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
