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
import {
  type Device,
  deviceForWidth,
  type Island,
  ISLANDS,
  type Pose,
} from '@/shared/frame-device'
import type { FrameSizeName } from '@/shared/frame-sizes'
import type { FrameRecord, ProjectKitRecord } from '@/shared/records/list'

import { ActionTooltip } from '../chrome/action-tooltip'
import { ChromeMenuContent, MENU_ROW } from '../chrome/menu'
import type { Box } from '../geometry/box'
import { dropPending, holdBoxes, writeBoxes } from '../geometry/write'
import { reportRefusal } from '../left-panel/page-actions'
import { select, selectionStore } from '../selection'
import {
  renameFrame,
  startFrameRename,
  stopFrameRename,
  useRenamingFrame,
} from '../structure/actions'
import { KitRow } from './kit-row'
import { LabelTip } from './label-tip'
import { type NumberChange, NumberField } from './number-field'
import { boxesSizedTo, FRAME_TOOL_GROUPS, matchSize } from './presets'
import { PreviewRow } from './preview-row'
import { WidthsRow } from './widths-row'

const FIELDS = [
  { key: 'x', letter: 'X', label: 'X position' },
  { key: 'y', letter: 'Y', label: 'Y position' },
  { key: 'width', letter: 'W', label: 'Width' },
  { key: 'height', letter: 'H', label: 'Height' },
] as const

type Field = (typeof FIELDS)[number]['key']

const NO_KITS: readonly ProjectKitRecord[] = []

interface FrameSectionProps {
  /** The selected frames as drawn, one or several. */
  frames: readonly FrameRecord[]
  /** The page they sit on, which the write names. */
  page: string
  write?: typeof writeBoxes
  /** The server calls a rename makes, the board's own when absent. */
  calls?: Structure
}

/**
 * The selection's place and size, written through the gestures' own write. A
 * typed value sets every selected frame, and a step on `Mixed` moves each by
 * the step from its own value.
 */
export function FrameSection({
  frames,
  page,
  write = writeBoxes,
  calls,
}: FrameSectionProps) {
  const canWrite = useLive((state) => state.canWrite)
  const renaming = useRenamingFrame('inspector')
  const kits = useLive(
    (state) =>
      state.board?.projects.find(({ name }) => name === frames[0]?.project)
        ?.kits,
  )
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
      {several ? null : renaming === frame.ref ? (
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
      {several ? null : (
        <WidthsRow
          frame={frame}
          disabled={!canWrite || locked}
          calls={calls ?? structure}
        />
      )}
      <KitRow
        frames={frames}
        kits={kits ?? NO_KITS}
        disabled={!canWrite || locked}
        calls={calls ?? structure}
      />
    </section>
  )
}

/**
 * The selected element's frame as one row, its name selecting the frame, in
 * place of the frame's own fields.
 */
export function FrameCrumb({
  page,
  frame,
  element,
}: {
  page: string
  frame: FrameRecord
  /** The element's name as its Layers row shows it. */
  element: string
}) {
  return (
    <section
      aria-labelledby="inspector-frame"
      className="flex h-9 shrink-0 items-center gap-1 border-b border-sidebar-border px-3 whitespace-nowrap"
    >
      <h2 id="inspector-frame" className="sr-only">
        Frame
      </h2>
      <ActionTooltip label="Select the frame" side="bottom">
        <button
          type="button"
          onClick={() => select(selectionStore, page, [frame.ref])}
          className="-ml-1 min-w-0 shrink truncate rounded-[5px] px-1 py-px text-muted-foreground outline-none hover:bg-accent hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring/50"
        >
          {frame.name}
        </button>
      </ActionTooltip>
      <span aria-hidden className="text-faint">
        /
      </span>
      <span className="min-w-0 truncate font-semibold">{element}</span>
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

/**
 * How the frames hold their height, Fixed, Fit, or Scroll. A frame picked
 * back to Scroll takes the screen height it left Scroll at in this tab, while
 * it still hugs or still holds the height Fit gave it.
 */
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
      write={async (refs, mode) => {
        const heights = mode === 'scroll' ? screenHeightsOf(frames) : {}
        if (mode !== 'scroll') rememberScreens(frames)
        const result = await calls.setHeightMode(
          refs,
          mode,
          Object.fromEntries(frames.map(({ ref, box }) => [ref, box])),
          Object.keys(heights).length > 0 ? heights : undefined,
        )
        if (mode === 'scroll') for (const ref of refs) screens.delete(ref)
        return result
      }}
    />
  )
}

/**
 * The screen height each frame left Scroll at, with the height it held when
 * it last left Fit, by ref. It lasts the tab rather than the file, so a reload
 * falls back to the server's own scroll height.
 */
const screens = new Map<string, { screen: number; fitted?: number }>()

function rememberScreens(frames: readonly FrameRecord[]): void {
  for (const { ref, box, scroll, hugHeight } of frames) {
    if (scroll) screens.set(ref, { screen: box.height })
    const held = screens.get(ref)
    if (held && hugHeight) held.fitted = box.height
  }
}

function screenHeightsOf(
  frames: readonly FrameRecord[],
): Record<string, number> {
  const heights: Record<string, number> = {}
  for (const { ref, box, hugHeight } of frames) {
    const held = screens.get(ref)
    if (held && (hugHeight || held.fitted === box.height)) {
      heights[ref] = held.screen
    }
  }
  return heights
}

const DEVICE_NAMES = {
  phone: 'Phone',
  tablet: 'Tablet',
  laptop: 'Laptop',
  foldable: 'Foldable',
} as const satisfies Record<Device, string>

const DEVICE_TIP =
  'Drawn by the board around the frame, a phone from 320 wide, a tablet from 480, and a laptop from 1024. The file is unchanged, and export can include it.'

const ISLAND_NAMES = {
  compact: 'Compact',
  wide: 'Wide',
} as const satisfies Record<Island, string>

const POSE_NAMES = {
  closed: 'Closed',
  half: 'Half open',
  open: 'Open',
} as const satisfies Record<Pose, string>

/**
 * The device a frame's width picks, its upright width while turned, which
 * the record names while the device shows, since a turned box is wider.
 */
function widthDevice(frame: FrameRecord): Device | null {
  return frame.device && frame.device !== 'foldable'
    ? frame.device
    : deviceForWidth(frame.box.width)
}

/** The device a frame's width picks, as the row names it. */
function widthDeviceName(frame: FrameRecord): string {
  const device = widthDevice(frame)
  return device ? DEVICE_NAMES[device] : 'No device fits'
}

/**
 * Whether the board draws each frame inside its device, and which: the one
 * its width picks or the foldable it names, whose pose is set on the canvas
 * as `canon/design/inspector/device-foldable` draws. `Mixed` turns it on for all.
 */
function DeviceRow({ frames, disabled, calls }: HeightRowProps) {
  const id = 'inspector-device'
  const { shown, pick } = usePick({
    frames,
    valueOf: (frame) => frame.showDevice === true,
    refusal: 'Couldn’t set the device',
    write: (refs, show) => calls.setDevice(refs, show),
  })
  const { shown: foldable, pick: pickFoldable } = usePick({
    frames,
    valueOf: (frame) => frame.pose !== undefined,
    refusal: 'Couldn’t set the device',
    write: (refs, named) => calls.setFoldable(refs, named),
  })
  const names = frames.map((frame) =>
    frame.pose ? DEVICE_NAMES.foldable : widthDeviceName(frame),
  )
  const named = names.every((name) => name === names[0]) ? names[0] : 'Mixed'
  const value = shown === null ? 'Mixed' : shown ? named : undefined
  const byWidth = frames.map(widthDeviceName)
  const picked = byWidth.every((name) => name === byWidth[0])
    ? byWidth[0]
    : 'Mixed'
  const [first] = frames
  const pose =
    shown && first?.pose && frames.every((frame) => frame.pose === first.pose)
      ? first.pose
      : undefined
  const { shown: wide, pick: pickIsland } = usePick({
    frames,
    valueOf: (frame) => frame.island === 'wide',
    refusal: 'Couldn’t set the island',
    write: (refs, picked) => calls.setIsland(refs, picked ? 'wide' : 'compact'),
  })
  const phones = frames.every(
    (frame) => !frame.pose && widthDevice(frame) === 'phone',
  )

  return (
    <>
      <div className="mt-2.5 flex h-4 items-center justify-between gap-2">
        <LabelTip label="Show device" tip={DEVICE_TIP} tipId={`${id}-tip`}>
          <label htmlFor={id} className="text-xs">
            Show device
          </label>
        </LabelTip>
        <span className="flex min-w-0 items-center gap-2">
          {value && shown && !disabled ? (
            <DropdownMenu>
              <DropdownMenuTrigger
                id={`${id}-value`}
                className="flex h-4 min-w-0 items-center gap-0.5 rounded-[4px] px-0.5 text-caption text-muted-foreground outline-none hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring/50 aria-expanded:text-foreground"
              >
                <span className="truncate">{value}</span>
                <span className="sr-only"> device</span>
                <ChevronDown aria-hidden className="size-2.5 shrink-0" />
              </DropdownMenuTrigger>
              <ChromeMenuContent
                align="end"
                sideOffset={4}
                className="w-auto min-w-[180px]"
              >
                <DropdownMenuRadioGroup
                  value={
                    foldable === null ? null : foldable ? 'foldable' : 'width'
                  }
                  onValueChange={(device: 'width' | 'foldable') =>
                    pickFoldable(device === 'foldable')
                  }
                >
                  <DropdownMenuRadioItem
                    value="width"
                    closeOnClick
                    className={cn(MENU_ROW, 'pr-8 whitespace-nowrap')}
                  >
                    By width
                    <span className="ml-auto pl-2 text-muted-foreground">
                      {picked}
                    </span>
                  </DropdownMenuRadioItem>
                  <DropdownMenuRadioItem
                    value="foldable"
                    closeOnClick
                    className={cn(MENU_ROW, 'pr-8 whitespace-nowrap')}
                  >
                    {DEVICE_NAMES.foldable}
                  </DropdownMenuRadioItem>
                </DropdownMenuRadioGroup>
                {phones ? (
                  <>
                    <DropdownMenuSeparator />
                    <DropdownMenuRadioGroup
                      value={wide === null ? null : wide ? 'wide' : 'compact'}
                      onValueChange={(island: Island) =>
                        pickIsland(island === 'wide')
                      }
                    >
                      <DropdownMenuLabel className="px-2 text-label font-normal">
                        Island
                      </DropdownMenuLabel>
                      {ISLANDS.map((island) => (
                        <DropdownMenuRadioItem
                          key={island}
                          value={island}
                          closeOnClick
                          className={cn(MENU_ROW, 'pr-8 whitespace-nowrap')}
                        >
                          {ISLAND_NAMES[island]}
                          <span className="sr-only"> island</span>
                        </DropdownMenuRadioItem>
                      ))}
                    </DropdownMenuRadioGroup>
                  </>
                ) : null}
              </ChromeMenuContent>
            </DropdownMenu>
          ) : value ? (
            <span
              id={`${id}-value`}
              className="truncate text-caption text-muted-foreground"
            >
              {value}
            </span>
          ) : null}
          <button
            id={id}
            type="button"
            role="switch"
            aria-checked={shown === true}
            aria-describedby={value ? `${id}-value ${id}-tip` : `${id}-tip`}
            disabled={disabled}
            onClick={() => pick(shown !== true)}
            className={cn(
              'relative h-3.5 w-[26px] shrink-0 rounded-full outline-none focus-visible:ring-2 focus-visible:ring-ring/50 disabled:pointer-events-none disabled:opacity-40',
              shown === true ? 'bg-primary' : 'bg-input',
            )}
          >
            <span
              aria-hidden
              className={cn(
                'absolute top-0.5 size-2.5 rounded-full bg-white transition-[left] motion-reduce:transition-none',
                shown === true ? 'left-[14px]' : 'left-0.5',
              )}
            />
          </button>
        </span>
      </div>
      {pose ? (
        <p className="mt-1.5 text-caption text-muted-foreground">
          {POSE_NAMES[pose]}. The pose is set on the canvas.
        </p>
      ) : null}
    </>
  )
}

interface ChoiceRowProps<T extends string> {
  id: string
  title: string
  /** The sentence the title's mark shows, which describes the radio group. */
  tip?: string
  choices: readonly { value: T; label: string }[]
  frames: readonly FrameRecord[]
  valueOf: (frame: FrameRecord) => T
  disabled: boolean
  /** The toast a refused write raises. */
  refusal: string
  write: (refs: string[], value: T) => Promise<unknown>
}

/**
 * One frame setting, null where frames differ, with a pick that writes all in
 * one step. The pick stands until the records move off its starting value, so
 * an undo back to it reads as stored.
 */
function usePick<T>({
  frames,
  valueOf,
  refusal,
  write,
}: {
  frames: readonly FrameRecord[]
  valueOf: (frame: FrameRecord) => T
  refusal: string
  write: (refs: string[], value: T) => Promise<unknown>
}): { shown: T | null; pick: (value: T) => void } {
  const refs = frames.map((frame) => frame.ref)
  const values = frames.map(valueOf)
  const stored = values.every((value) => value === values[0])
    ? (values[0] ?? null)
    : null
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

  const pick = (value: T) => {
    if (value === shown) return
    setPending({ key, from: stored, value })
    write(refs, value).catch((error: unknown) => {
      setPending(null)
      reportRefusal(refusal)(error)
    })
  }
  return { shown, pick }
}

/**
 * One frame setting as a radio group, checking nothing where frames differ.
 * A pick shows at once until the board answers, and a refusal puts it back.
 */
function ChoiceRow<T extends string>({
  id,
  title,
  tip,
  choices,
  frames,
  valueOf,
  disabled,
  refusal,
  write,
}: ChoiceRowProps<T>) {
  const { shown, pick } = usePick({ frames, valueOf, refusal, write })
  const buttons = useRef<(HTMLButtonElement | null)[]>([])

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
        {tip ? (
          <LabelTip label={title} tip={tip} tipId={`${id}-tip`}>
            <span id={id} className="text-caption text-muted-foreground">
              {title}
            </span>
          </LabelTip>
        ) : (
          <span id={id} className="text-caption text-muted-foreground">
            {title}
          </span>
        )}
        {shown === null ? (
          <span className="text-caption text-muted-foreground">Mixed</span>
        ) : null}
      </div>
      <div
        role="radiogroup"
        aria-labelledby={id}
        aria-describedby={tip ? `${id}-tip` : undefined}
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
