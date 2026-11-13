import { ChevronDown } from 'lucide-react'
import { Fragment, type KeyboardEvent, useRef, useState } from 'react'

import { RenameField } from '@/client/components/rename-field'
import {
  DropdownMenu,
  DropdownMenuLabel,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/client/components/ui/dropdown-menu'
import { cn } from '@/client/lib/cn'
import { useLive } from '@/client/live/store'
import {
  type HeightMode,
  type Structure,
  structure,
} from '@/client/live/structure'
import type { FrameSizeName } from '@/shared/frame-sizes'
import type { FrameRecord } from '@/shared/records/list'

import { ChromeMenuContent, MENU_ROW } from '../chrome/menu'
import type { Box } from '../geometry/box'
import { dropPending, holdBoxes, writeBoxes } from '../geometry/write'
import { reportRefusal } from '../left-panel/page-actions'
import {
  renameFrame,
  startFrameRename,
  stopFrameRename,
  useRenamingFrame,
} from '../structure/actions'
import { type NumberChange, NumberField } from './number-field'
import { PhoneLink } from './phone-link'
import { boxesSizedTo, FRAME_TOOL_GROUPS, matchSize } from './presets'
import { PreviewRow } from './preview-row'

const FIELDS = [
  { key: 'x', letter: 'X', label: 'X position' },
  { key: 'y', letter: 'Y', label: 'Y position' },
  { key: 'width', letter: 'W', label: 'Width' },
  { key: 'height', letter: 'H', label: 'Height' },
] as const

type Field = (typeof FIELDS)[number]['key']

interface FrameSectionProps {
  /** The selected frames as drawn, one or several. */
  frames: readonly FrameRecord[]
  /** The page they sit on, which the write names. */
  page: string
  /** False while an element inside the frame is selected, which hides the name row as `inspector/text` draws it. */
  named?: boolean
  write?: typeof writeBoxes
  /** The server calls a rename makes, the board's own when absent. */
  calls?: Structure
}

/**
 * The selection's place and size. One frame shows its name, which a click
 * renames in place, and several show `N frames` with `Mixed` where their values
 * differ. A field writes through the same write the gestures use, a typed
 * value setting every selected frame and a step on `Mixed` moving each by
 * the step, and a step or scrub draws each frame at its pending box first.
 * The heading opens the Frame tool's sizes, a pick setting W and H on every
 * frame in one write. The Height row under the fields sets how every frame
 * holds its height, and the Preview row under it shows the frames at another
 * width and writes nothing. One frame ends the section with a button opening
 * it on a phone.
 */
export function FrameSection({
  frames,
  page,
  named = true,
  write = writeBoxes,
  calls,
}: FrameSectionProps) {
  const canWrite = useLive((state) => state.canWrite)
  const renaming = useRenamingFrame('inspector')
  // The boxes a previewed gesture started from, which its pending boxes now hide.
  const started = useRef<Record<string, Box> | null>(null)
  const [frame] = frames
  if (!frame) return null
  const several = frames.length > 1
  const locked = frames.some((candidate) => candidate.locked)

  const resize = (field: Field, change: NumberChange) => {
    const from =
      started.current ??
      Object.fromEntries(frames.map(({ ref, box }) => [ref, box]))
    const boxes: Record<string, Box> = {}
    const expected: Record<string, Box> = {}
    for (const [ref, box] of Object.entries(from)) {
      const next = { ...box, [field]: change(box[field]) }
      if (next[field] === box[field]) continue
      boxes[ref] = next
      expected[ref] = box
    }
    return { boxes, expected }
  }

  const preview = (field: Field, change: NumberChange | null) => {
    if (!change) {
      if (started.current) dropPending(Object.keys(started.current))
      started.current = null
      return
    }
    started.current ??= Object.fromEntries(
      frames.map(({ ref, box }) => [ref, box]),
    )
    holdBoxes({ ...started.current, ...resize(field, change).boxes })
  }

  const commit = (field: Field, change: NumberChange) => {
    const { boxes, expected } = resize(field, change)
    const held = started.current
    started.current = null
    // The write draws its own pending boxes, so the preview's drop for frames it leaves alone.
    if (held) dropPending(Object.keys(held).filter((ref) => !(ref in boxes)))
    return write(page, boxes, expected)
  }

  return (
    <section
      aria-labelledby="inspector-frame"
      className="border-b border-sidebar-border px-3 pt-2.5 pb-3"
    >
      <SizeMenu
        frames={frames}
        disabled={!canWrite || locked}
        onPick={(name) => {
          const { boxes, expected } = boxesSizedTo(frames, name)
          void write(page, boxes, expected)
        }}
      />
      {several || !named ? null : renaming === frame.ref ? (
        <div className="mb-1.5 flex h-[26px] items-center pl-1.5">
          <RenameField
            name={frame.name}
            label={`Rename frame ${frame.name}`}
            onCommit={(name) => {
              stopFrameRename()
              void renameFrame(frame, name, calls)
            }}
            onCancel={stopFrameRename}
          />
        </div>
      ) : (
        <button
          type="button"
          aria-label={`Rename frame ${frame.name}`}
          disabled={!canWrite}
          onClick={() => startFrameRename(frame.ref, 'inspector')}
          className="mb-1.5 block h-[26px] w-full truncate rounded-md bg-input px-2 text-left text-xs outline-none hover:ring-1 hover:ring-border focus-visible:ring-2 focus-visible:ring-ring/50 disabled:hover:ring-0"
        >
          {frame.name}
        </button>
      )}
      <div className="grid grid-cols-2 gap-1.5">
        {FIELDS.map(({ key, letter, label }) => (
          <NumberField
            key={key}
            prefix={letter}
            label={label}
            value={shared(frames.map(({ box }) => box[key]))}
            min={key === 'width' || key === 'height' ? 1 : undefined}
            format={WHOLE}
            disabled={!canWrite || locked}
            onPreview={(change) => preview(key, change)}
            onCommit={(change) => commit(key, change)}
          />
        ))}
      </div>
      <HeightRow
        frames={frames}
        disabled={!canWrite || locked}
        calls={calls ?? structure}
      />
      <PreviewRow frames={frames} />
      {several ? null : <PhoneLink frame={frame} disabled={!canWrite} />}
    </section>
  )
}

interface SizeMenuProps {
  frames: readonly FrameRecord[]
  disabled: boolean
  onPick: (name: FrameSizeName) => void
}

/**
 * The section heading as a menu of the Frame tool's sizes, naming on its right
 * the row the frames measure, `Custom` for a size no row holds, and `Mixed`
 * where the frames differ.
 */
function SizeMenu({ frames, disabled, onPick }: SizeMenuProps) {
  const rows = frames.map(({ box }) => matchSize(box))
  const [first] = rows
  const same = rows.every((row) => row?.name === first?.name)
  const checked = same ? first?.name : undefined
  const shown = !same ? 'Mixed' : (first?.label ?? 'Custom')
  return (
    <div className="mb-2 flex h-5 items-center justify-between gap-2">
      <h2 id="inspector-frame" className="-ml-1 text-xs font-semibold">
        <DropdownMenu>
          <DropdownMenuTrigger
            disabled={disabled}
            aria-describedby="inspector-frame-size"
            className="flex h-5 items-center gap-1 rounded-[5px] px-1 outline-none hover:bg-accent focus-visible:ring-2 focus-visible:ring-ring/50 disabled:hover:bg-transparent aria-expanded:bg-accent"
          >
            {frames.length > 1 ? `${frames.length} frames` : 'Frame'}
            <ChevronDown
              aria-hidden
              className={cn(
                'size-2.5 text-muted-foreground',
                disabled && 'opacity-0',
              )}
            />
          </DropdownMenuTrigger>
          <ChromeMenuContent
            align="start"
            sideOffset={4}
            className="w-auto min-w-[220px]"
          >
            {FRAME_TOOL_GROUPS.map(({ group, label, rows: sizes }, index) => (
              <Fragment key={group}>
                {index > 0 ? <DropdownMenuSeparator /> : null}
                <DropdownMenuRadioGroup
                  value={
                    sizes.some((row) => row.name === checked) ? checked : null
                  }
                  onValueChange={(name: FrameSizeName) => {
                    if (name !== checked) onPick(name)
                  }}
                >
                  <DropdownMenuLabel className="px-2 text-label font-normal">
                    {label}
                  </DropdownMenuLabel>
                  {sizes.map((row) => (
                    <DropdownMenuRadioItem
                      key={row.name}
                      value={row.name}
                      // A radio row stays open by default, and a pick is the menu's whole job.
                      closeOnClick
                      className={cn(MENU_ROW, 'pr-8 whitespace-nowrap')}
                    >
                      {row.label}
                      <span className="ml-auto pl-2 text-muted-foreground tabular-nums">
                        {row.width} × {row.height}
                      </span>
                    </DropdownMenuRadioItem>
                  ))}
                </DropdownMenuRadioGroup>
              </Fragment>
            ))}
          </ChromeMenuContent>
        </DropdownMenu>
      </h2>
      <span
        id="inspector-frame-size"
        className="truncate text-muted-foreground"
      >
        {shown}
      </span>
    </div>
  )
}

/** A frame's box is whole pixels, so a typed fraction rounds. */
const WHOLE: Intl.NumberFormatOptions = { maximumFractionDigits: 0 }

const HEIGHT_MODES = [
  { mode: 'fixed', label: 'Fixed' },
  { mode: 'fit', label: 'Fit' },
  { mode: 'scroll', label: 'Scroll' },
] as const satisfies readonly { mode: HeightMode; label: string }[]

function heightModeOf({ scroll, hugHeight }: FrameRecord): HeightMode {
  if (scroll) return 'scroll'
  return hugHeight ? 'fit' : 'fixed'
}

interface HeightRowProps {
  frames: readonly FrameRecord[]
  disabled: boolean
  calls: Structure
}

/**
 * How the frames hold their height, Fixed, Fit, or Scroll, as one radio
 * group read off the records, checking nothing and reading `Mixed` where
 * they differ. A pick writes every frame in one step and shows at once,
 * until the board answers with the frames' new mode or the write is
 * refused, which puts the stored mode back.
 */
function HeightRow({ frames, disabled, calls }: HeightRowProps) {
  const refs = frames.map((frame) => frame.ref)
  const modes = frames.map(heightModeOf)
  const stored = modes.every((mode) => mode === modes[0])
    ? (modes[0] ?? null)
    : null
  // A pick stands until the frames read another mode than the one it was made
  // from, and is then forgotten, so an undo back to that mode reads as stored.
  const [pending, setPending] = useState<{
    key: string
    from: HeightMode | null
    mode: HeightMode
  } | null>(null)
  const key = refs.join('\n')
  if (pending && (pending.key !== key || pending.from !== stored)) {
    setPending(null)
  }
  const shown =
    pending && pending.key === key && pending.from === stored
      ? pending.mode
      : stored
  const buttons = useRef<(HTMLButtonElement | null)[]>([])

  const pick = (mode: HeightMode) => {
    if (mode === shown) return
    setPending({ key, from: stored, mode })
    const expected = Object.fromEntries(
      frames.map(({ ref, box }) => [ref, box]),
    )
    calls.setHeightMode(refs, mode, expected).catch((error: unknown) => {
      setPending(null)
      reportRefusal('Couldn’t set the height')(error)
    })
  }

  const step = (event: KeyboardEvent, index: number) => {
    const by = ARROW_STEPS[event.key]
    if (by === undefined) return
    event.preventDefault()
    const next = (index + by + HEIGHT_MODES.length) % HEIGHT_MODES.length
    const target = HEIGHT_MODES[next]
    if (!target) return
    buttons.current[next]?.focus()
    pick(target.mode)
  }

  // The checked radio takes the tab stop, or the first where none is.
  const focusable = Math.max(
    0,
    HEIGHT_MODES.findIndex(({ mode }) => mode === shown),
  )

  return (
    <div className="mt-2.5">
      <div className="mb-1.5 flex h-4 items-center justify-between">
        <span
          id="inspector-height"
          className="text-caption text-muted-foreground"
        >
          Height
        </span>
        {shown === null ? (
          <span className="text-caption text-muted-foreground">Mixed</span>
        ) : null}
      </div>
      <div
        role="radiogroup"
        aria-labelledby="inspector-height"
        className="flex h-[26px] gap-0.5 rounded-md bg-input p-0.5"
      >
        {HEIGHT_MODES.map(({ mode, label }, index) => (
          <button
            key={mode}
            ref={(button) => {
              buttons.current[index] = button
            }}
            type="button"
            role="radio"
            aria-checked={mode === shown}
            tabIndex={index === focusable ? 0 : -1}
            disabled={disabled}
            onClick={() => pick(mode)}
            onKeyDown={(event) => step(event, index)}
            className={cn(
              'grid flex-1 place-items-center rounded-[5px] text-muted-foreground outline-none hover:bg-sidebar hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring/50 active:bg-sidebar disabled:pointer-events-none disabled:opacity-40',
              mode === shown && 'bg-sidebar text-foreground shadow-xs',
            )}
          >
            {label}
          </button>
        ))}
      </div>
    </div>
  )
}

/** The radio group's arrow keys, each moving one radio along and picking it. */
const ARROW_STEPS: Readonly<Record<string, number>> = {
  ArrowRight: 1,
  ArrowDown: 1,
  ArrowLeft: -1,
  ArrowUp: -1,
}

function shared(values: readonly number[]): number | null {
  const [first] = values
  return first !== undefined && values.every((value) => value === first)
    ? first
    : null
}
