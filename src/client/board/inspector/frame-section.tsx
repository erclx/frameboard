import { useRef } from 'react'

import { RenameField } from '@/client/components/rename-field'
import { useLive } from '@/client/live/store'
import type { Structure } from '@/client/live/structure'
import type { FrameRecord } from '@/shared/records/list'

import type { Box } from '../geometry/box'
import { dropPending, holdBoxes, writeBoxes } from '../geometry/write'
import {
  renameFrame,
  startFrameRename,
  stopFrameRename,
  useRenamingFrame,
} from '../structure/actions'
import { type NumberChange, NumberField } from './number-field'

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
      <h2 id="inspector-frame" className="mb-2 text-xs font-semibold">
        {several ? `${frames.length} frames` : 'Frame'}
      </h2>
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
    </section>
  )
}

/** A frame's box is whole pixels, so a typed fraction rounds. */
const WHOLE: Intl.NumberFormatOptions = { maximumFractionDigits: 0 }

function shared(values: readonly number[]): number | null {
  const [first] = values
  return first !== undefined && values.every((value) => value === first)
    ? first
    : null
}
