import { Link2 } from 'lucide-react'

import type { StyleValue } from '@/shared/records/elements'
import type { TokenRow } from '@/shared/records/tokens'
import type { Theme } from '@/shared/theme'

import { RawFlag, Swatch } from './element/color-row'
import { chipName, COLOR_ROW, swatchOf, TOKEN_CHIP } from './element/values'

interface SelectionColorsProps {
  /** The colors the selection uses, deduplicated, each with its token or none. */
  colors: readonly StyleValue[]
  tokens: readonly TokenRow[]
  theme: Theme
}

/**
 * Selection colors: one read-only row per color the selection uses, with
 * its swatch, its token chip or raw hex, its percent, and the link on a
 * token or the raw flag on a value no token names.
 */
export function SelectionColors({
  colors,
  tokens,
  theme,
}: SelectionColorsProps) {
  if (colors.length === 0) return null
  return (
    <section
      aria-labelledby="inspector-selection-colors"
      className="border-b border-sidebar-border px-3 pt-2.5 pb-3"
    >
      <h2
        id="inspector-selection-colors"
        className="mb-2 text-xs font-semibold"
      >
        Selection colors
      </h2>
      <ul className="flex flex-col gap-1.5">
        {colors.map((color) => (
          <li
            key={`${color.token ?? color.value}:${color.percent}`}
            className={COLOR_ROW}
          >
            <Swatch color={swatchOf(color, tokens, theme)} />
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
          </li>
        ))}
      </ul>
    </section>
  )
}
