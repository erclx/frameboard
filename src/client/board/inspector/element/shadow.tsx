import { cn } from 'cn'
import { ChevronDown } from 'lucide-react'

import {
  DropdownMenu,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/client/components/ui/dropdown-menu'
import type { StyleValue } from '@/shared/records/elements'
import type { TokenRow } from '@/shared/records/tokens'
import type { Theme } from '@/shared/theme'

import { ChromeMenuContent, MENU_ROW } from '../../chrome/menu'
import { RawFlag } from './color-row'
import {
  chipName,
  COLOR_ROW,
  SWATCH_RING,
  TOKEN_CHIP,
  tokenValue,
} from './values'
import type { WriteElement } from './write'

interface ShadowSectionProps {
  boxShadow: StyleValue | null
  /** The project's `--shadow*` tokens. */
  shadows: readonly TokenRow[]
  theme: Theme
  disabled: boolean
  write: WriteElement
}

/**
 * Shadow: a menu of the project's shadow tokens and None, writing
 * `box-shadow: var(--token)`, or `box-shadow: none` for None, which also
 * covers a shadow a stylesheet rule sets. None writes nothing while no
 * shadow is set.
 */
export function ShadowSection({
  boxShadow,
  shadows,
  theme,
  disabled,
  write,
}: ShadowSectionProps) {
  const none = !boxShadow || boxShadow.value.trim().toLowerCase() === 'none'
  const shown = none
    ? null
    : boxShadow.token
      ? tokenValue(shadows, boxShadow.token, theme)
      : boxShadow.value
  const set = (value: string) =>
    void write({ kind: 'style', property: 'box-shadow', value })
  return (
    <section
      aria-labelledby="inspector-shadow"
      className="border-b border-sidebar-border px-3 pt-2.5 pb-3"
    >
      <h2 id="inspector-shadow" className="mb-2 text-xs font-semibold">
        Shadow
      </h2>
      <DropdownMenu>
        <DropdownMenuTrigger
          aria-label="Shadow"
          disabled={disabled}
          className={`${COLOR_ROW} w-full text-left outline-none focus-visible:ring-2 focus-visible:ring-ring/50 disabled:opacity-50`}
        >
          <ShadowSwatch shadow={shown} />
          {none ? (
            <span className="flex-1 text-muted-foreground">None</span>
          ) : boxShadow.token ? (
            <span className={TOKEN_CHIP}>{chipName(boxShadow.token)}</span>
          ) : (
            <span className="flex-1 truncate">{boxShadow.value}</span>
          )}
          {!none && !boxShadow.token ? <RawFlag /> : null}
          <ChevronDown
            aria-hidden
            className="ml-auto size-2.5 shrink-0 text-muted-foreground"
          />
        </DropdownMenuTrigger>
        <ChromeMenuContent
          align="start"
          sideOffset={6}
          className="w-(--anchor-width)"
        >
          {shadows.map((row) => (
            <DropdownMenuItem
              key={row.name}
              className={MENU_ROW}
              onClick={() => set(`var(${row.name})`)}
            >
              <ShadowSwatch shadow={row[theme]} />
              {chipName(row.name)}
            </DropdownMenuItem>
          ))}
          {shadows.length > 0 ? <DropdownMenuSeparator /> : null}
          <DropdownMenuItem
            className={MENU_ROW}
            onClick={() => {
              if (!none) set('none')
            }}
          >
            None
          </DropdownMenuItem>
        </ChromeMenuContent>
      </DropdownMenu>
    </section>
  )
}

function ShadowSwatch({ shadow }: { shadow: string | null }) {
  return (
    <span
      aria-hidden
      className={cn('size-3.5 shrink-0 rounded-[3px] bg-sidebar', SWATCH_RING)}
      style={shadow ? { boxShadow: shadow } : undefined}
    />
  )
}
