import { cn } from 'cn'
import { Link2 } from 'lucide-react'
import { useState } from 'react'

import { toast } from '@/client/components/ui/toast'
import type { StyleValue } from '@/shared/records/elements'
import type { TokenRow } from '@/shared/records/tokens'
import type { Theme } from '@/shared/theme'

import { RawFlag, Swatch } from './element/color-row'
import { chipName, COLOR_ROW, swatchOf, TOKEN_CHIP } from './element/values'

/** The rows the list shows before `Show all`, so the section never pushes the panel's foot out of reach. */
const CAP = 5

interface SelectionColorsProps {
  /** The colors the selection uses, deduplicated, each with its token or none. */
  colors: readonly StyleValue[]
  tokens: readonly TokenRow[]
  theme: Theme
}

/**
 * Selection colors: one row per color the selection uses, raw values first
 * since they are the ones to replace, capped at five rows until `Show all`.
 * A row shows its swatch, its token chip or raw hex, its percent, and the
 * link on a token or the raw flag on a value no token names, and pressing it
 * copies the hex or the token's `var()`. A caller keys it by the selection,
 * so a new selection caps the list again.
 */
export function SelectionColors({
  colors,
  tokens,
  theme,
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
            <ColorButton
              color={color}
              swatch={swatchOf(color, tokens, theme)}
            />
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
      onClick={() => {
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
              description:
                error instanceof Error ? error.message : String(error),
              type: 'error',
            }),
        )
      }}
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
