import { cn } from 'cn'
import { RotateCcw } from 'lucide-react'
import { type RefObject, useRef, useState } from 'react'

import { Popover, PopoverContent } from '@/client/components/ui/popover'
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
import type { TokenChange } from './write'

/** Sends one edit of the row's token, answering whether it landed. */
export type WriteRow = (change: TokenChange) => Promise<boolean>

interface RowProps {
  row: TokenRow
  /** Whether the winning value comes from the project's sheet, which tags the row Project. */
  fromProject: boolean
  /** Whether the row takes edits, false on a reading tab, while the sheet it writes does not parse, or for a board sheet outside the board folder. */
  editable: boolean
  onWrite: WriteRow
}

const ROW = 'mx-1.5 grid h-7 items-center gap-1.5 rounded-md px-1.5'

/** A color token: its name, tag, and reset, then a light and a dark swatch, each opening the picker. */
export function ColorRow({ row, fromProject, editable, onWrite }: RowProps) {
  const item = useRef<HTMLLIElement>(null)
  return (
    <li ref={item} className={cn(ROW, 'grid-cols-[1fr_18px_18px]')}>
      <RowHead
        row={row}
        fromProject={fromProject}
        editable={editable}
        onWrite={onWrite}
      />
      {(['light', 'dark'] as const).map((side) =>
        editable ? (
          <SwatchPicker
            key={side}
            name={row.name}
            side={side}
            value={row[side]}
            row={item}
            onWrite={onWrite}
          />
        ) : (
          <Swatch key={side} side={side} value={row[side]} />
        ),
      )}
    </li>
  )
}

/** Any other token: a number scrubs and writes on release, and any other value edits as text. */
export function ValueRow({ row, fromProject, editable, onWrite }: RowProps) {
  const value = row.light ?? row.dark ?? ''
  const number = NUMBER.exec(value.trim())
  return (
    <li className={cn(ROW, 'grid-cols-[1fr_auto]')}>
      <RowHead
        row={row}
        fromProject={fromProject}
        editable={editable}
        onWrite={onWrite}
      />
      {!editable ? (
        <span
          className="max-w-32 truncate text-muted-foreground"
          title={shownValue(row)}
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
          onWrite={onWrite}
        />
      )}
    </li>
  )
}

// A plain number with an optional unit, such as `4px`, `1.5`, or `-2rem`.
const NUMBER = /^(-?\d*\.?\d+)([a-z%]*)$/i

function RowHead({ row, fromProject, editable, onWrite }: RowProps) {
  return (
    <span className="flex min-w-0 items-center gap-1.5">
      <span className="min-w-0 flex-1 truncate" title={row.name}>
        <span className="text-faint">--</span>
        {row.name.replace(/^--/, '')}
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
          // A left margin alone, since a negative right one reaches the light swatch's target.
          className="-ml-1 grid size-6 shrink-0 place-items-center rounded-sm text-muted-foreground outline-none hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring/50"
        >
          <RotateCcw aria-hidden className="size-3" />
        </button>
      ) : null}
    </span>
  )
}

const TITLES = { light: 'Light', dark: 'Dark' } as const

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
        className="size-4 rounded-[4px] border border-dashed border-faint"
      />
    )
  }
  return (
    <span
      role="img"
      aria-label={`${TITLES[side]}: ${value}`}
      title={value}
      className={cn('size-4 rounded-[4px]', SWATCH_RING)}
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
 * A swatch that opens the picker on Custom for its theme, titled Light or
 * Dark. The swatch previews the picked color while the picker is open, which
 * writes once as it closes or on Enter in the hex field, and Esc closes it
 * writing nothing.
 */
function SwatchPicker({
  name,
  side,
  value,
  row,
  onWrite,
}: {
  name: string
  side: 'light' | 'dark'
  value: string | null
  /** The row the picker opens beside, so it clears both swatches. */
  row: RefObject<HTMLLIElement | null>
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
      {/* A 24px target around the 16px swatch, spilling into the column gap. */}
      <button
        ref={anchor}
        type="button"
        aria-label={`${title}: ${value ?? 'not set'}`}
        title={value ?? `Not set in ${side}`}
        onClick={open}
        className="-m-[3px] grid size-6 place-items-center rounded-md outline-none focus-visible:ring-2 focus-visible:ring-ring/50"
      >
        <span
          aria-hidden
          className={cn(
            'size-4 rounded-[4px]',
            shown === null ? 'border border-dashed border-faint' : SWATCH_RING,
          )}
          style={shown === null ? undefined : { background: shown }}
        />
      </button>
      <Popover
        open={picking !== null}
        onOpenChange={(next, details) => {
          if (!next) close(details.reason !== 'escape-key')
        }}
      >
        <PopoverContent
          anchor={row}
          side="right"
          align="start"
          sideOffset={16}
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
        inputClassName="h-5 rounded-sm px-1 text-right text-muted-foreground focus-visible:text-foreground"
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
  onWrite,
}: {
  name: string
  value: string
  shown: string
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
        className="max-w-32 truncate rounded-sm px-1 text-muted-foreground outline-none hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring/50"
      >
        {shown}
      </button>
    )
  }
  return (
    <input
      aria-label={label}
      // The field replaces the button the click landed on, so it takes focus in its place.
      // oxlint-disable-next-line jsx-a11y/no-autofocus
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
          finish(false, true)
        }
      }}
      className="h-5 w-32 rounded-sm bg-input px-1 text-right outline-none focus-visible:ring-2 focus-visible:ring-ring/50"
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
