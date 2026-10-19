import { type KeyboardEvent, useState } from 'react'

import { RenameField } from '@/client/components/rename-field'
import { Input } from '@/client/components/ui/input'
import { useLive } from '@/client/live/store'
import type { Structure } from '@/client/live/structure'
import type { FrameRecord } from '@/shared/records/list'

import type { Box } from '../geometry/box'
import { writeBoxes } from '../geometry/write'
import { renameFrame } from '../structure/actions'

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
  write?: typeof writeBoxes
  /** The server calls a rename makes, the board's own when absent. */
  calls?: Structure
}

/**
 * The selection's place and size. One frame shows its name, which a click
 * renames in place, and several show `N frames` with `Mixed` where their values
 * differ. A field commits on Enter or blur through the same write the
 * gestures use, setting that value on every selected frame.
 */
export function FrameSection({
  frames,
  page,
  write = writeBoxes,
  calls,
}: FrameSectionProps) {
  const canWrite = useLive((state) => state.canWrite)
  const [renaming, setRenaming] = useState<string | null>(null)
  const [frame] = frames
  if (!frame) return null
  const several = frames.length > 1
  const locked = frames.some((candidate) => candidate.locked)

  const commit = (field: Field, value: number) => {
    const boxes: Record<string, Box> = {}
    const expected: Record<string, Box> = {}
    for (const { ref, box } of frames) {
      const next = { ...box, [field]: value }
      if (next[field] === box[field]) continue
      boxes[ref] = next
      expected[ref] = box
    }
    void write(page, boxes, expected)
  }

  return (
    <section
      aria-labelledby="inspector-frame"
      className="border-b border-sidebar-border px-3 pt-2.5 pb-3"
    >
      <h2 id="inspector-frame" className="mb-2 text-xs font-semibold">
        {several ? `${frames.length} frames` : 'Frame'}
      </h2>
      {several ? null : renaming === frame.ref ? (
        <div className="mb-1.5 flex h-[26px] items-center pl-1.5">
          <RenameField
            name={frame.name}
            label={`Rename frame ${frame.name}`}
            onCommit={(name) => {
              setRenaming(null)
              void renameFrame(frame, name, calls)
            }}
            onCancel={() => setRenaming(null)}
          />
        </div>
      ) : (
        <button
          type="button"
          aria-label={`Rename frame ${frame.name}`}
          disabled={!canWrite}
          onClick={() => setRenaming(frame.ref)}
          className="mb-1.5 block h-[26px] w-full truncate rounded-md bg-input px-2 text-left text-xs outline-none hover:ring-1 hover:ring-border focus-visible:ring-2 focus-visible:ring-ring/50 disabled:hover:ring-0"
        >
          {frame.name}
        </button>
      )}
      <div className="grid grid-cols-2 gap-1.5">
        {FIELDS.map(({ key, letter, label }) => (
          <BoxField
            key={key}
            letter={letter}
            label={label}
            value={shared(frames.map(({ box }) => box[key]))}
            min={key === 'width' || key === 'height' ? 1 : undefined}
            disabled={!canWrite || locked}
            onCommit={(value) => commit(key, value)}
          />
        ))}
      </div>
    </section>
  )
}

interface BoxFieldProps {
  letter: string
  label: string
  /** Null when the selected frames differ, which reads `Mixed`. */
  value: number | null
  min?: number
  disabled: boolean
  onCommit: (value: number) => void
}

function BoxField({
  letter,
  label,
  value,
  min,
  disabled,
  onCommit,
}: BoxFieldProps) {
  const shown = value === null ? 'Mixed' : String(value)
  // Null while the field shows the frames' value, a string while it is typed in.
  const [draft, setDraft] = useState<string | null>(null)

  const commit = () => {
    if (draft === null) return
    setDraft(null)
    const typed = Number(draft.trim())
    if (draft.trim() === shown || !Number.isInteger(typed)) return
    onCommit(min === undefined ? typed : Math.max(min, typed))
  }

  const onKeyDown = (event: KeyboardEvent<HTMLInputElement>) => {
    if (event.key === 'Enter') commit()
    if (event.key === 'Escape') {
      setDraft(null)
      event.currentTarget.blur()
    }
  }

  return (
    <label className="relative block">
      <span
        aria-hidden
        className="pointer-events-none absolute top-1/2 left-2 -translate-y-1/2 text-xs text-faint"
      >
        {letter}
      </span>
      <Input
        aria-label={label}
        inputMode="numeric"
        className="pl-[26px]"
        value={draft ?? shown}
        disabled={disabled}
        onFocus={(event) => event.currentTarget.select()}
        onChange={(event) => setDraft(event.currentTarget.value)}
        onBlur={commit}
        onKeyDown={onKeyDown}
      />
    </label>
  )
}

function shared(values: readonly number[]): number | null {
  const [first] = values
  return first !== undefined && values.every((value) => value === first)
    ? first
    : null
}
