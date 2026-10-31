import { cn } from 'cn'
import {
  AlignHorizontalDistributeCenter,
  AlignHorizontalSpaceBetween,
  ArrowDown,
  ArrowRight,
  LayoutGrid,
  Plus,
  Scan,
  Square,
  WrapText,
} from 'lucide-react'
import { type KeyboardEvent, type ReactNode, useRef, useState } from 'react'

import type { ElementFlow } from '@/shared/records/elements'

import { ActionTooltip } from '../../chrome/action-tooltip'
import { NumberField } from '../number-field'
import { SizeRow } from './size'
import type { Flow, LiveLayout } from './styles'
import { Segmented } from './type-details'
import type { PreviewStyle, WriteElement } from './write'

const WHOLE: Intl.NumberFormatOptions = { maximumFractionDigits: 0 }

const FLOWS = [
  { value: 'block', label: 'Block', icon: Square },
  { value: 'vertical', label: 'Vertical', icon: ArrowDown },
  { value: 'horizontal', label: 'Horizontal', icon: ArrowRight },
  { value: 'wrap', label: 'Wrap', icon: WrapText },
  { value: 'grid', label: 'Grid', icon: LayoutGrid },
] as const satisfies readonly { value: Flow; label: string; icon: unknown }[]

const GAP_MODES = [
  {
    value: 'fixed',
    label: 'Gap between: space items by the Gap value',
    icon: AlignHorizontalDistributeCenter,
  },
  {
    value: 'auto',
    label: 'Auto gap: spread items with space between',
    icon: AlignHorizontalSpaceBetween,
  },
] as const

type Place = 'start' | 'center' | 'end'

const PLACES: readonly Place[] = ['start', 'center', 'end']

const PLACE_VALUE: Record<Place, string> = {
  start: 'flex-start',
  center: 'center',
  end: 'flex-end',
}

/** A computed `justify-content` or `align-items` as the cell it lights, start for a value no cell names. */
function placeOf(value: string): Place {
  if (value === 'center') return 'center'
  if (['flex-end', 'end', 'right', 'last baseline'].includes(value))
    return 'end'
  return 'start'
}

type Declarations = { property: string; value: string }[]

/**
 * The declarations a flow pick writes on the element alone, each only where
 * the computed value differs, so a pick from Horizontal to Vertical writes
 * the direction and nothing else. Grid writes `display` alone, never tracks.
 */
function flowDeclarations(layout: LiveLayout, to: Flow): Declarations {
  const declarations: Declarations = []
  const set = (property: string, value: string, current: string) => {
    if (value !== current) declarations.push({ property, value })
  }
  const display =
    to === 'block'
      ? layout.inline
        ? 'inline-block'
        : 'block'
      : to === 'grid'
        ? layout.inline
          ? 'inline-grid'
          : 'grid'
        : layout.inline
          ? 'inline-flex'
          : 'flex'
  const was = flowDisplay(layout)
  set('display', display, was)
  if (to === 'vertical' || to === 'horizontal' || to === 'wrap') {
    set(
      'flex-direction',
      to === 'vertical' ? 'column' : 'row',
      layout.direction,
    )
    set('flex-wrap', to === 'wrap' ? 'wrap' : 'nowrap', layout.wrap)
  }
  return declarations
}

function flowDisplay({ flow, inline }: LiveLayout): string {
  if (flow === 'grid') return inline ? 'inline-grid' : 'grid'
  if (flow === 'block') return inline ? 'inline-block' : 'block'
  return inline ? 'inline-flex' : 'flex'
}

interface LayoutSectionProps {
  layout: LiveLayout
  /** The static read, absent until the styles answer or from an older server. */
  flow: ElementFlow | undefined
  /** Whether it holds text alone, which takes size and padding but no flow. */
  textOnly: boolean
  disabled: boolean
  write: WriteElement
  preview?: PreviewStyle
}

/**
 * The Layout section: the flow as Block, Vertical, Horizontal, Wrap, or
 * Grid, the size per axis, alignment with gap or Auto gap, and padding.
 * Every control writes the selected element's own `style`, so a flow a
 * shared rule sets is overridden on this element alone, which the caption
 * names with the rule's match count. A grid takes gap and padding and
 * keeps its tracks.
 */
export function LayoutSection({
  layout,
  flow,
  textOnly,
  disabled,
  write,
  preview,
}: LayoutSectionProps) {
  const rule = flow?.rule ?? null
  const flex =
    layout.flow === 'vertical' ||
    layout.flow === 'horizontal' ||
    layout.flow === 'wrap'
  const pick = (to: Flow) => {
    const declarations = flowDeclarations(layout, to)
    if (declarations.length > 0) void write({ kind: 'styles', declarations })
  }
  return (
    <section
      aria-labelledby="inspector-layout"
      className="border-b border-sidebar-border px-3 pt-2.5 pb-3"
    >
      <div className="mb-2 flex items-center justify-between gap-2">
        <h2 id="inspector-layout" className="text-xs font-semibold">
          Layout
        </h2>
        {rule && rule.count > 1 ? (
          <ActionTooltip label="The flow comes from a rule these elements share. An edit writes this element alone.">
            <span
              tabIndex={0}
              className="min-w-0 truncate text-caption text-muted-foreground outline-none focus-visible:ring-2 focus-visible:ring-ring/50"
            >
              <code className="font-mono text-foreground">{rule.selector}</code>
              {' · '}shared by {rule.count} elements
            </span>
          </ActionTooltip>
        ) : null}
        {!textOnly && layout.flow === 'block' ? (
          <ActionTooltip label="Add flow">
            <button
              type="button"
              aria-label="Add flow"
              disabled={disabled}
              onClick={() => pick('vertical')}
              className="grid size-5 place-items-center rounded-[5px] text-muted-foreground outline-none hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring/50 disabled:opacity-50"
            >
              <Plus aria-hidden className="size-[13px]" />
            </button>
          </ActionTooltip>
        ) : null}
      </div>
      {textOnly ? null : (
        <>
          <p id="inspector-flow" className="sr-only">
            Flow
          </p>
          <Segmented
            labelledBy="inspector-flow"
            options={FLOWS}
            current={layout.flow}
            disabled={disabled}
            onPick={(value) => pick(value as Flow)}
          />
        </>
      )}
      <SizeRow
        layout={layout}
        size={flow?.size ?? null}
        disabled={disabled}
        write={write}
        preview={preview}
      />
      {flex || layout.flow === 'grid' ? (
        <GapRow
          layout={layout}
          flex={flex}
          disabled={disabled}
          write={write}
          preview={preview}
        />
      ) : null}
      <PaddingRow
        padding={layout.padding}
        disabled={disabled}
        write={write}
        preview={preview}
      />
    </section>
  )
}

interface GapRowProps {
  layout: LiveLayout
  /** False for a grid, which takes a gap and no alignment or Auto gap. */
  flex: boolean
  disabled: boolean
  write: WriteElement
  preview?: PreviewStyle
}

/** Alignment as a 3×3 grid beside the gap and Auto gap, for a flex container, and the gap alone for a grid. */
function GapRow({ layout, flex, disabled, write, preview }: GapRowProps) {
  const vertical = layout.flow === 'vertical'
  const auto = layout.justify === 'space-between'
  const gap = vertical ? layout.rowGap : layout.columnGap
  const gapField = (
    <NumberField
      label="Gap"
      prefix={<GapIcon />}
      inset="pl-[28px]"
      value={gap}
      min={0}
      format={WHOLE}
      disabled={disabled}
      onPreview={(change) =>
        preview?.('gap', change ? `${change(gap)}px` : null)
      }
      onCommit={(change) =>
        write({ kind: 'style', property: 'gap', value: `${change(gap)}px` })
      }
    />
  )
  if (!flex) {
    return (
      <>
        <p className="mt-1.5 mb-[3px] ml-0.5 text-caption text-muted-foreground">
          Gap
        </p>
        {gapField}
      </>
    )
  }
  const main = placeOf(layout.justify)
  const cross = placeOf(layout.alignItems)
  return (
    <>
      <p
        id="inspector-alignment-gap"
        className="mt-1.5 mb-[3px] ml-0.5 text-caption text-muted-foreground"
      >
        Alignment and gap
      </p>
      <div className="grid grid-cols-[62px_1fr] gap-1.5">
        <AlignmentGrid
          vertical={vertical}
          main={auto ? null : main}
          cross={cross}
          disabled={disabled}
          onPick={(mainAt, crossAt) =>
            void write({
              kind: 'styles',
              declarations: [
                { property: 'justify-content', value: PLACE_VALUE[mainAt] },
                { property: 'align-items', value: PLACE_VALUE[crossAt] },
              ],
            })
          }
        />
        <div className="flex flex-col gap-1.5">
          {gapField}
          <Segmented
            labelledBy="inspector-alignment-gap"
            options={GAP_MODES}
            current={auto ? 'auto' : 'fixed'}
            disabled={disabled}
            onPick={(value) =>
              void write({
                kind: 'style',
                property: 'justify-content',
                // Off drops the element's own value, or names the start over a rule's.
                value:
                  value === 'auto'
                    ? 'space-between'
                    : layout.ownJustify
                      ? ''
                      : 'flex-start',
              })
            }
          />
        </div>
      </div>
    </>
  )
}

interface AlignmentGridProps {
  vertical: boolean
  /** The main axis's place, null under Auto gap, where every row lights its cross place. */
  main: Place | null
  cross: Place
  disabled: boolean
  onPick: (main: Place, cross: Place) => void
}

/** Arrow keys move focus across the 3×3 cells, stopping at each edge, without writing. */
const GRID_STEPS: Record<string, (at: number) => number> = {
  ArrowRight: (at) => (at % 3 === 2 ? at : at + 1),
  ArrowLeft: (at) => (at % 3 === 0 ? at : at - 1),
  ArrowDown: (at) => (at >= 6 ? at : at + 3),
  ArrowUp: (at) => (at < 3 ? at : at - 3),
}

const NAMES: Record<Place, [string, string]> = {
  start: ['top', 'left'],
  center: ['center', 'center'],
  end: ['bottom', 'right'],
}

/** Nine cells, each writing the main and cross place it stands for in one edit. */
function AlignmentGrid({
  vertical,
  main,
  cross,
  disabled,
  onPick,
}: AlignmentGridProps) {
  const cells = useRef<(HTMLButtonElement | null)[]>([])
  const litAt = (row: number, column: number) => {
    const mainAt = PLACES[vertical ? row : column]
    const crossAt = PLACES[vertical ? column : row]
    return crossAt === cross && (main === null || mainAt === main)
  }
  // One tab stop, on the first lit cell, so Tab leaves the grid in one press.
  const lit = Array.from({ length: 9 }, (_, at) =>
    litAt(Math.floor(at / 3), at % 3),
  ).indexOf(true)
  const stop = lit === -1 ? 0 : lit
  const onKeyDown = (event: KeyboardEvent, at: number) => {
    const step = GRID_STEPS[event.key]
    if (!step) return
    event.preventDefault()
    cells.current[step(at)]?.focus()
  }
  return (
    <div
      role="group"
      aria-label="Alignment"
      className="grid h-[58px] grid-cols-3 grid-rows-3 rounded-md bg-input p-1"
    >
      {PLACES.flatMap((row, rowAt) =>
        PLACES.map((column, columnAt) => {
          // A row runs its main axis across the columns, a column down the rows.
          const mainAt = vertical ? row : column
          const crossAt = vertical ? column : row
          const at = rowAt * 3 + columnAt
          const lit = litAt(rowAt, columnAt)
          const label = `Align ${NAMES[row][0]} ${NAMES[column][1]}`
          return (
            <button
              key={`${row}-${column}`}
              ref={(cell) => {
                cells.current[at] = cell
              }}
              type="button"
              aria-label={label}
              aria-pressed={lit}
              tabIndex={at === stop ? 0 : -1}
              disabled={disabled}
              onKeyDown={(event) => onKeyDown(event, at)}
              onClick={() => onPick(mainAt, crossAt)}
              className="group/cell grid place-items-center rounded-[3px] outline-none focus-visible:ring-2 focus-visible:ring-ring/50 disabled:opacity-50"
            >
              <span
                aria-hidden
                className={cn(
                  'rounded-full',
                  lit
                    ? 'h-0.5 w-2.5 bg-primary'
                    : 'size-[3px] bg-muted-foreground/50 group-hover/cell:bg-foreground',
                )}
              />
            </button>
          )
        }),
      )}
    </div>
  )
}

interface PaddingRowProps {
  padding: LiveLayout['padding']
  disabled: boolean
  write: WriteElement
  preview?: PreviewStyle
}

type Side = 'top' | 'right' | 'bottom' | 'left'

/**
 * Horizontal and vertical padding, each writing its two longhands as one
 * edit, with a toggle opening a field per side. A pair whose sides differ
 * reads `Mixed`, and a step moves each side by the step from its own.
 */
function PaddingRow({ padding, disabled, write, preview }: PaddingRowProps) {
  const [sides, setSides] = useState(
    padding.left !== padding.right || padding.top !== padding.bottom,
  )
  const field = (label: string, icon: ReactNode, at: readonly Side[]) => {
    const values = at.map((side) => padding[side])
    const [first = 0] = values
    const same = values.every((value) => value === first)
    return (
      <NumberField
        key={label}
        label={label}
        prefix={icon}
        inset="pl-[28px]"
        value={same ? first : null}
        min={0}
        format={WHOLE}
        disabled={disabled}
        onPreview={(change) => {
          for (const side of at) {
            preview?.(
              `padding-${side}`,
              change ? `${Math.max(0, change(padding[side]))}px` : null,
            )
          }
        }}
        onCommit={(change) =>
          write({
            kind: 'styles',
            declarations: at.map((side) => ({
              property: `padding-${side}`,
              value: `${Math.max(0, change(padding[side]))}px`,
            })),
          })
        }
      />
    )
  }
  return (
    <>
      <p className="mt-1.5 mb-[3px] ml-0.5 text-caption text-muted-foreground">
        Padding
      </p>
      <div className="grid grid-cols-[1fr_1fr_26px] gap-1.5">
        {sides ? (
          <>
            {field('Left padding', <SideIcon side="left" />, ['left'])}
            {field('Top padding', <SideIcon side="top" />, ['top'])}
          </>
        ) : (
          <>
            {field('Horizontal padding', <PadIcon vertical={false} />, [
              'left',
              'right',
            ])}
            {field('Vertical padding', <PadIcon vertical />, ['top', 'bottom'])}
          </>
        )}
        <ActionTooltip label="Padding per side">
          <button
            type="button"
            aria-label="Padding per side"
            aria-pressed={sides}
            disabled={disabled}
            onClick={() => setSides(!sides)}
            className={cn(
              'grid h-[26px] place-items-center rounded-md text-muted-foreground outline-none hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring/50 disabled:opacity-50',
              sides && 'bg-input text-foreground',
            )}
          >
            <Scan aria-hidden className="size-[13px]" />
          </button>
        </ActionTooltip>
        {sides ? (
          <>
            {field('Right padding', <SideIcon side="right" />, ['right'])}
            {field('Bottom padding', <SideIcon side="bottom" />, ['bottom'])}
          </>
        ) : null}
      </div>
    </>
  )
}

function Icon({ children }: { children: ReactNode }) {
  return (
    <svg
      aria-hidden
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.6}
      strokeLinecap="round"
      strokeLinejoin="round"
      className="size-3"
    >
      {children}
    </svg>
  )
}

function GapIcon() {
  return (
    <Icon>
      <path d="M4 5v14M20 5v14M10 9v6M14 9v6" />
    </Icon>
  )
}

function PadIcon({ vertical }: { vertical: boolean }) {
  return vertical ? (
    <Icon>
      <path d="M5 4h14M5 20h14" />
      <rect x="9" y="8" width="6" height="8" rx="1" />
    </Icon>
  ) : (
    <Icon>
      <path d="M4 5v14M20 5v14" />
      <rect x="8" y="9" width="8" height="6" rx="1" />
    </Icon>
  )
}

const SIDE_PATH: Record<Side, string> = {
  top: 'M5 4h14',
  right: 'M20 5v14',
  bottom: 'M5 20h14',
  left: 'M4 5v14',
}

function SideIcon({ side }: { side: Side }) {
  return (
    <Icon>
      <path d={SIDE_PATH[side]} />
      <rect x="8" y="8" width="8" height="8" rx="1" opacity={0.5} />
    </Icon>
  )
}
