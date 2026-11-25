import type { ReactNode, Ref } from 'react'
import { useStore } from 'zustand'

import { Button } from '@/client/components/ui/button'
import { cn } from '@/client/lib/cn'
import { useLive } from '@/client/live/store'
import { shownTheme, themeStore } from '@/client/theme/store'
import type { ProjectKitRecord } from '@/shared/records/list'
import type { FontList } from '@/shared/records/sourcing'
import type { TokenRow, TokenTable } from '@/shared/records/tokens'

import { SWATCH_RING } from '../../inspector/element/values'
import {
  openTheme,
  type ThemeCounts,
  type ThemeOpener,
  type ThemeSection,
} from './dialog-store'
import { familyRows } from './families'
import { fileName } from './token-names'

interface ThemeCardsProps {
  counts: ThemeCounts
  kits: readonly ProjectKitRecord[]
  /** The installed fonts, undefined while they read and null when the read failed. */
  fonts: FontList | null | undefined
  /** The token table, undefined while it reads and null when the read failed. */
  table: TokenTable | null | undefined
  /** Keeps each opener, so the dialog hands the focus back to it. */
  openerRef: (opener: ThemeOpener) => Ref<HTMLButtonElement>
}

/** What each part of the project's look holds, each card opening the dialog on its section. */
export function ThemeCards({
  counts,
  kits,
  fonts,
  table,
  openerRef,
}: ThemeCardsProps) {
  const canWrite = useLive((state) => state.canWrite)
  const rest = sum(counts.radius, counts.font, counts.other)
  return (
    <div className="flex flex-col gap-2 px-2 pt-1 pb-2">
      <Card
        section="kits"
        title="Kits"
        count={counts.kits}
        openerRef={openerRef}
      >
        <Line quiet={kits.length === 0}>
          {kits.length === 0
            ? 'None yet'
            : kits.map((kit) => kit.title).join(', ')}
        </Line>
      </Card>
      <Card
        section="fonts"
        title="Fonts"
        count={counts.fonts}
        openerRef={openerRef}
      >
        <FontNames fonts={fonts} />
      </Card>
      <Card
        section="color"
        title="Colors"
        count={counts.color}
        openerRef={openerRef}
      >
        {counts.color ? <Swatches table={table} /> : null}
        <TokenState table={table} count={counts.color} />
      </Card>
      <Card
        section="radius"
        title="Radius, type, other"
        count={rest}
        openerRef={openerRef}
      >
        <TokenState table={table} count={rest} />
      </Card>
      <Button
        ref={openerRef('edit')}
        size="sm"
        aria-haspopup="dialog"
        className="w-full text-xs"
        onClick={() => openTheme('kits', 'edit')}
      >
        {canWrite ? 'Edit theme…' : 'View theme…'}
      </Button>
    </div>
  )
}

function Card({
  section,
  title,
  count,
  openerRef,
  children,
}: {
  section: ThemeSection
  title: string
  count: number | null
  openerRef: ThemeCardsProps['openerRef']
  children: ReactNode
}) {
  return (
    <button
      ref={openerRef(section)}
      type="button"
      aria-haspopup="dialog"
      onClick={() => openTheme(section, section)}
      className="group flex min-w-0 flex-col gap-1 rounded-lg bg-secondary p-2.5 text-left outline-none hover:bg-accent focus-visible:ring-2 focus-visible:ring-ring"
    >
      <span className="font-semibold">
        {count ? `${title} · ${count}` : title}
      </span>
      {children}
    </button>
  )
}

const QUIET = 'text-muted-foreground group-hover:text-foreground'

function Line({
  quiet = true,
  children,
}: {
  quiet?: boolean
  children: ReactNode
}) {
  return (
    <span className={cn('w-full truncate', quiet && QUIET)}>{children}</span>
  )
}

/** The family names, each in its own face, as many as one line holds. */
function FontNames({ fonts }: Pick<ThemeCardsProps, 'fonts'>) {
  // Holds its line while the list reads, so the cards under it keep their place.
  if (fonts === undefined) return <Line>&nbsp;</Line>
  const rows = familyRows(fonts?.fonts ?? [])
  return (
    <>
      <Line quiet={false}>
        {rows.map((row, index) => (
          <span key={row.family}>
            {index > 0 ? ', ' : null}
            <span
              className="text-(length:--text-panel)"
              style={{ fontFamily: row.stack }}
            >
              {row.family}
            </span>
          </span>
        ))}
      </Line>
      {fonts === null ? <Line>Installed fonts did not load</Line> : null}
    </>
  )
}

/** The colors as the board's theme shows them, as many as one line holds. */
function Swatches({ table }: Pick<ThemeCardsProps, 'table'>) {
  const theme = useStore(themeStore, shownTheme)
  const colors = table?.tokens.filter(isColor) ?? []
  return (
    <span aria-hidden className="flex h-3.5 flex-wrap gap-1 overflow-hidden">
      {colors.map((row) => {
        const value = row[theme]
        return (
          <span
            key={row.name}
            className={cn(
              'size-3.5 rounded-[3px]',
              value === null
                ? 'border border-dashed border-faint'
                : SWATCH_RING,
            )}
            style={value === null ? undefined : { background: value }}
          />
        )
      })}
    </span>
  )
}

/** Why a token card is short of tokens, nothing when it is not. */
function TokenState({
  table,
  count,
}: Pick<ThemeCardsProps, 'table'> & { count: number | null }) {
  if (table === undefined) return <Line>&nbsp;</Line>
  if (table === null) return <Line>Did not load</Line>
  const broken = table.sheets.find((sheet) => sheet.error !== null)
  if (broken) {
    return (
      <span className="w-full truncate text-destructive group-hover:text-foreground">
        {fileName(broken.path)} does not parse
      </span>
    )
  }
  return count === 0 ? <Line>None yet</Line> : null
}

function isColor(row: TokenRow): boolean {
  return row.group === 'color'
}

function sum(...counts: (number | null)[]): number | null {
  return counts.reduce<number | null>(
    (total, count) => (total === null || count === null ? null : total + count),
    0,
  )
}
