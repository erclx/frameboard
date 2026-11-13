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
import type { Device } from '@/shared/frame-device'
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
 * holds its height, the Device row which device the board draws around each,
 * and the Preview row under it shows the frames at another
 * width and writes nothing.
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
      <DeviceRow
        frames={frames}
        disabled={!canWrite || locked}
        calls={calls ?? structure}
      />
      <PreviewRow frames={frames} />
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
  { value: 'fixed', label: 'Fixed' },
  { value: 'fit', label: 'Fit' },
  { value: 'scroll', label: 'Scroll' },
] as const satisfies readonly { value: HeightMode; label: string }[]

function heightModeOf({ scroll, hugHeight }: FrameRecord): HeightMode {
  if (scroll) return 'scroll'
  return hugHeight ? 'fit' : 'fixed'
}

interface HeightRowProps {
  frames: readonly FrameRecord[]
  disabled: boolean
  calls: Structure
}

/** How the frames hold their height, Fixed, Fit, or Scroll. */
function HeightRow({ frames, disabled, calls }: HeightRowProps) {
  return (
    <ChoiceRow
      id="inspector-height"
      title="Height"
      choices={HEIGHT_MODES}
      frames={frames}
      valueOf={heightModeOf}
      disabled={disabled}
      refusal="Couldn’t set the height"
      write={(refs, mode) =>
        calls.setHeightMode(
          refs,
          mode,
          Object.fromEntries(frames.map(({ ref, box }) => [ref, box])),
        )
      }
    />
  )
}

const DEVICE_CHOICES = [
  { value: 'none', label: 'None' },
  { value: 'phone', label: 'Phone' },
  { value: 'tablet', label: 'Tablet' },
] as const satisfies readonly { value: Device | 'none'; label: string }[]

/**
 * The device the board draws around the frames, None, Phone, or Tablet,
 * which leaves each frame file and its size as they are.
 */
function DeviceRow({ frames, disabled, calls }: HeightRowProps) {
  return (
    <>
      <ChoiceRow
        id="inspector-device"
        title="Device"
        choices={DEVICE_CHOICES}
        frames={frames}
        valueOf={(frame) => frame.device ?? 'none'}
        disabled={disabled}
        refusal="Couldn’t set the device"
        write={(refs, device) =>
          calls.setDevice(refs, device === 'none' ? null : device)
        }
      />
      <p className="mt-1.5 text-caption text-muted-foreground">
        Drawn by the board around the frame. The file is unchanged, and export
        can include it.
      </p>
    </>
  )
}

interface ChoiceRowProps<T extends string> {
  id: string
  title: string
  choices: readonly { value: T; label: string }[]
  frames: readonly FrameRecord[]
  valueOf: (frame: FrameRecord) => T
  disabled: boolean
  /** The toast a refused write raises. */
  refusal: string
  write: (refs: string[], value: T) => Promise<unknown>
}

/**
 * One setting of the frames as one radio group read off the records,
 * checking nothing and reading `Mixed` where they differ. A pick writes
 * every frame in one step and shows at once, until the board answers with
 * the frames' new value or the write is refused, which puts the stored
 * value back.
 */
function ChoiceRow<T extends string>({
  id,
  title,
  choices,
  frames,
  valueOf,
  disabled,
  refusal,
  write,
}: ChoiceRowProps<T>) {
  const refs = frames.map((frame) => frame.ref)
  const values = frames.map(valueOf)
  const stored = values.every((value) => value === values[0])
    ? (values[0] ?? null)
    : null
  // A pick stands until the frames read another value than the one it was
  // made from, and is then forgotten, so an undo back to it reads as stored.
  const [pending, setPending] = useState<{
    key: string
    from: T | null
    value: T
  } | null>(null)
  const key = refs.join('\n')
  if (pending && (pending.key !== key || pending.from !== stored)) {
    setPending(null)
  }
  const shown =
    pending && pending.key === key && pending.from === stored
      ? pending.value
      : stored
  const buttons = useRef<(HTMLButtonElement | null)[]>([])

  const pick = (value: T) => {
    if (value === shown) return
    setPending({ key, from: stored, value })
    write(refs, value).catch((error: unknown) => {
      setPending(null)
      reportRefusal(refusal)(error)
    })
  }

  const step = (event: KeyboardEvent, index: number) => {
    const by = ARROW_STEPS[event.key]
    if (by === undefined) return
    event.preventDefault()
    const next = (index + by + choices.length) % choices.length
    const target = choices[next]
    if (!target) return
    buttons.current[next]?.focus()
    pick(target.value)
  }

  // The checked radio takes the tab stop, or the first where none is.
  const focusable = Math.max(
    0,
    choices.findIndex(({ value }) => value === shown),
  )

  return (
    <div className="mt-2.5">
      <div className="mb-1.5 flex h-4 items-center justify-between">
        <span id={id} className="text-caption text-muted-foreground">
          {title}
        </span>
        {shown === null ? (
          <span className="text-caption text-muted-foreground">Mixed</span>
        ) : null}
      </div>
      <div
        role="radiogroup"
        aria-labelledby={id}
        className="flex h-[26px] gap-0.5 rounded-md bg-input p-0.5"
      >
        {choices.map(({ value, label }, index) => (
          <button
            key={value}
            ref={(button) => {
              buttons.current[index] = button
            }}
            type="button"
            role="radio"
            aria-checked={value === shown}
            tabIndex={index === focusable ? 0 : -1}
            disabled={disabled}
            onClick={() => pick(value)}
            onKeyDown={(event) => step(event, index)}
            className={cn(
              'grid flex-1 place-items-center rounded-[5px] text-muted-foreground outline-none hover:bg-sidebar hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring/50 active:bg-sidebar disabled:pointer-events-none disabled:opacity-40',
              value === shown && 'bg-sidebar text-foreground shadow-xs',
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
