import { RotateCcw } from 'lucide-react'
import { useRef, useState } from 'react'

import { Popover, PopoverContent } from '@/client/components/ui/popover'
import { cn } from '@/client/lib/cn'
import type { TokenRow } from '@/shared/records/tokens'

import {
  ColorPickerPanel,
  type PickedColor,
} from '../../inspector/element/color-picker/panel'
import {
  hsvToRgb,
  resolveColor,
  toHex,
} from '../../inspector/element/color-picker/space'
import { colorCss, SWATCH_RING } from '../../inspector/element/values'
import { NumberField } from '../../inspector/number-field'
import type { WriteRow } from './token-writer'

interface RowProps {
  row: TokenRow
  /** Whether the winning value comes from the project's sheet, which tags the row Project. */
  fromProject: boolean
  /** Whether the row takes edits, false on a reading tab, while the sheet it writes does not parse, or for a board sheet outside the board folder. */
  editable: boolean
  onWrite: WriteRow
}

const ROW =
  'grid min-h-8 items-center gap-x-3 gap-y-1 border-b border-border py-1 last:border-b-0'

/** A color token: its name, tag, and reset, then its value in light and in dark, each opening the picker. */
export function ColorRow({ row, fromProject, editable, onWrite }: RowProps) {
  return (
    <li
      className={cn(
        ROW,
        'grid-cols-2 @lg:grid-cols-[minmax(0,1fr)_10rem_10rem]',
      )}
    >
      <RowHead
        row={row}
        fromProject={fromProject}
        editable={editable}
        onWrite={onWrite}
        className="col-span-2 @lg:col-span-1"
      />
      {(['light', 'dark'] as const).map((side) =>
        editable ? (
          <SwatchPicker
            key={side}
            name={row.name}
            side={side}
            value={row[side]}
            onWrite={onWrite}
          />
        ) : (
          <span key={side} className={VALUE}>
            <Swatch side={side} value={row[side]} />
            <SwatchValue value={row[side]} />
          </span>
        ),
      )}
    </li>
  )
}

/** Any other token: a number scrubs and writes on release, and any other value edits as text. */
export function ValueRow({ row, fromProject, editable, onWrite }: RowProps) {
  const value = row.light ?? row.dark ?? ''
  const number = NUMBER.exec(value.trim())
  const face = row.group === 'font' ? faceOf(value) : undefined
  return (
    <li
      className={cn(ROW, 'grid-cols-1 @lg:grid-cols-[minmax(0,1fr)_20.75rem]')}
    >
      <RowHead
        row={row}
        fromProject={fromProject}
        editable={editable}
        onWrite={onWrite}
      />
      {!editable ? (
        <span
          className="max-w-80 min-w-0 [overflow-wrap:anywhere] text-muted-foreground"
          style={{ fontFamily: face }}
          title={value}
        >
          {shownValue(row)}
        </span>
      ) : number ? (
        <NumberValue
          name={row.name}
          value={Number(number[1])}
          unit={number[2] ?? ''}
          onWrite={onWrite}
        />
      ) : (
        <TextValue
          name={row.name}
          value={value}
          shown={shownValue(row)}
          face={face}
          onWrite={onWrite}
        />
      )}
    </li>
  )
}

// A plain number with an optional unit, such as `4px`, `1.5`, or `-2rem`.
const NUMBER = /^(-?\d*\.?\d+)([a-z%]*)$/i

// A value and its swatch, at one size whether it opens the picker or not.
const VALUE =
  'flex min-h-6 min-w-0 items-center gap-2 rounded-md px-1 text-left'

function RowHead({
  row,
  fromProject,
  editable,
  onWrite,
  className,
}: RowProps & { className?: string }) {
  return (
    <span className={cn('flex min-w-0 items-center gap-1.5', className)}>
      <span className="flex min-w-0 flex-1">
        <span className="text-faint">--</span>
        <span className="min-w-0 [overflow-wrap:anywhere]">
          {row.name.replace(/^--/, '')}
        </span>
      </span>
      <span
        className={cn(
          'shrink-0 rounded-[3px] border px-1 text-[9px] leading-[14px]',
          fromProject
            ? 'border-primary text-foreground'
            : 'border-border text-muted-foreground',
        )}
      >
        {fromProject ? 'Project' : 'Board'}
      </span>
      {editable && row.overrides ? (
        <button
          type="button"
          aria-label={`Reset ${row.name.replace(/^--/, '')} to the board value`}
          title="Reset to the board value"
          onClick={() => void onWrite({ name: row.name, reset: true })}
          className="grid size-6 shrink-0 place-items-center rounded-sm text-muted-foreground outline-none hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring"
        >
          <RotateCcw aria-hidden className="size-3" />
        </button>
      ) : (
        // Holds the reset's place, so every row's tag lines up.
        <span aria-hidden className="size-6 shrink-0" />
      )}
    </span>
  )
}

const TITLES = { light: 'Light', dark: 'Dark' } as const

/** A value in words, beside its swatch. */
function SwatchValue({ value }: { value: string | null }) {
  return (
    <span
      aria-hidden
      className="min-w-0 flex-1 [overflow-wrap:anywhere] text-muted-foreground group-hover:text-foreground"
    >
      {value ?? 'Not set'}
    </span>
  )
}

function Swatch({
  side,
  value,
}: {
  side: 'light' | 'dark'
  value: string | null
}) {
  if (value === null) {
    return (
      <span
        role="img"
        aria-label={`${TITLES[side]}: not set`}
        title={`Not set in ${side}`}
        className="size-4 shrink-0 rounded-[4px] border border-dashed border-faint"
      />
    )
  }
  return (
    <span
      role="img"
      aria-label={`${TITLES[side]}: ${value}`}
      title={value}
      className={cn('size-4 shrink-0 rounded-[4px]', SWATCH_RING)}
      style={{ background: value }}
    />
  )
}

const BLACK: PickedColor = { hsv: { h: 0, s: 0, v: 0 }, percent: 100 }

function pickedCss({ hsv, percent }: PickedColor): string {
  return colorCss({ raw: `#${toHex(hsvToRgb(hsv)).toLowerCase()}` }, percent)
}

interface Picking {
  from: PickedColor
  color: PickedColor
}

/**
 * A theme swatch opening the picker, previewing while open and writing once
 * as it closes, Esc writing nothing.
 */
function SwatchPicker({
  name,
  side,
  value,
  onWrite,
}: {
  name: string
  side: 'light' | 'dark'
  value: string | null
  onWrite: WriteRow
}) {
  const anchor = useRef<HTMLButtonElement>(null)
  const [picking, setPicking] = useState<Picking | null>(null)
  const title = TITLES[side]
  const shown = picking ? pickedCss(picking.color) : value

  const open = () => {
    const hsv =
      value && anchor.current ? resolveColor(value, anchor.current) : null
    const from = hsv ? { hsv, percent: 100 } : BLACK
    setPicking({ from, color: from })
  }

  const close = (write: boolean) => {
    if (!picking) return
    setPicking(null)
    const css = pickedCss(picking.color)
    if (!write || css === pickedCss(picking.from)) return
    void onWrite({ name, side, value: css })
  }

  return (
    <>
      <button
        ref={anchor}
        type="button"
        aria-label={`${title}: ${value ?? 'not set'}`}
        title={value ?? `Not set in ${side}`}
        onClick={open}
        className={cn(
          VALUE,
          'group outline-none hover:bg-accent focus-visible:ring-2 focus-visible:ring-ring',
        )}
      >
        <span
          aria-hidden
          className={cn(
            'size-4 shrink-0 rounded-[4px]',
            shown === null ? 'border border-dashed border-faint' : SWATCH_RING,
          )}
          style={shown === null ? undefined : { background: shown }}
        />
        <SwatchValue value={shown} />
      </button>
      <Popover
        open={picking !== null}
        onOpenChange={(next, details) => {
          if (!next) close(details.reason !== 'escape-key')
        }}
      >
        <PopoverContent
          anchor={anchor}
          // Under the value, so the row's name and both its values stay in sight.
          side="bottom"
          align="start"
          sideOffset={6}
          aria-label={`${name.replace(/^--/, '')} ${side} color`}
          className="w-[248px] gap-0 rounded-xl p-2.5 text-xs shadow-[0_14px_40px_rgba(0,0,0,.28)]"
        >
          {picking ? (
            <>
              <p className="mb-2 text-xs font-semibold">{title}</p>
              <ColorPickerPanel
                label={title}
                color={picking.color}
                onColor={(color) => setPicking({ ...picking, color })}
                onSubmit={() => close(true)}
                tab="custom"
                onTab={() => {}}
                tokens={[]}
                theme={side}
                token={null}
                onToken={() => {}}
                tokensTab={false}
              />
            </>
          ) : null}
        </PopoverContent>
      </Popover>
    </>
  )
}

function NumberValue({
  name,
  value,
  unit,
  onWrite,
}: {
  name: string
  value: number
  unit: string
  onWrite: WriteRow
}) {
  return (
    <span className="flex items-center text-muted-foreground">
      <NumberField
        label={`${name.replace(/^--/, '')} value`}
        className="w-12"
        inputClassName="h-6 rounded-sm px-1 text-right text-muted-foreground focus-visible:text-foreground"
        value={value}
        // A token set at zero or above stays there, as a radius or a space does.
        min={value >= 0 ? 0 : undefined}
        format={{ maximumFractionDigits: 3 }}
        disabled={false}
        scrubValue
        onCommit={(change) =>
          onWrite({ name, side: 'both', value: `${change(value)}${unit}` })
        }
      />
      {unit}
    </span>
  )
}

/**
 * A value shown as text that turns into a field on a click, holding the
 * whole value. Enter or leaving the field writes it, and Esc puts the stored
 * value back and writes nothing.
 */
function TextValue({
  name,
  value,
  shown,
  face,
  onWrite,
}: {
  name: string
  value: string
  shown: string
  /** The family the value shows in, for a font. */
  face: string | undefined
  onWrite: WriteRow
}) {
  const [draft, setDraft] = useState<string | null>(null)
  // Leaving the field by key hands focus back to the value it replaced.
  const refocus = useRef(false)
  // Set once a key ended the edit, so a blur as the field unmounts ends nothing again.
  const ended = useRef(false)
  const label = `${name.replace(/^--/, '')} value`

  const finish = (write: boolean, byKey: boolean) => {
    if (draft === null || ended.current) return
    ended.current = true
    refocus.current = byKey
    setDraft(null)
    const typed = draft.trim()
    if (!write || typed === '' || typed === value.trim()) return
    void onWrite({ name, side: 'both', value: typed })
  }

  if (draft === null) {
    return (
      <button
        ref={(button) => {
          if (button && refocus.current) {
            refocus.current = false
            button.focus()
          }
        }}
        type="button"
        aria-label={`${label}: ${value}`}
        title={value}
        onClick={() => {
          ended.current = false
          setDraft(value)
        }}
        style={{ fontFamily: face }}
        className="min-h-6 max-w-80 min-w-0 justify-self-start rounded-sm px-1 text-left [overflow-wrap:anywhere] text-muted-foreground outline-none hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring"
      >
        {shown}
      </button>
    )
  }
  return (
    <input
      aria-label={label}
      // oxlint-disable-next-line jsx-a11y/no-autofocus -- it replaces the clicked button
      autoFocus
      value={draft}
      spellCheck={false}
      onFocus={(event) => event.currentTarget.select()}
      onChange={(event) => setDraft(event.currentTarget.value)}
      onBlur={() => finish(true, false)}
      onKeyDown={(event) => {
        if (event.key === 'Enter') {
          event.preventDefault()
          finish(true, true)
        } else if (event.key === 'Escape') {
          event.preventDefault()
          // The dialog around the field closes on an Esc that reaches it.
          event.stopPropagation()
          finish(false, true)
        }
      }}
      className="h-6 w-80 max-w-full rounded-sm bg-input px-1 outline-none focus-visible:ring-2 focus-visible:ring-ring"
    />
  )
}

/** The value a row shows, a font stack by its first family. */
function shownValue(row: TokenRow): string {
  const value = row.light ?? row.dark ?? ''
  if (row.group !== 'font') return value
  return (
    value
      .split(',')[0]
      ?.trim()
      .replace(/^["']|["']$/g, '') ?? value
  )
}

/** The family a font value draws in, undefined for one naming another token, which the chrome would resolve to its own. */
function faceOf(value: string): string | undefined {
  return value.includes('var(') ? undefined : value
}
