import { cn } from 'cn'
import { MoveHorizontal, X } from 'lucide-react'
import { useRef } from 'react'

import { FRAME_SIZES, presetAt, previewWidth } from '@/shared/frame-sizes'
import type { FrameRecord } from '@/shared/records/list'

import { ActionTooltip } from '../chrome/action-tooltip'
import {
  endPreview,
  type Preview,
  setPreview,
  usePreviews,
} from '../preview/store'
import type { NumberChange } from './number-field'
import { NumberField } from './number-field'
import { PRESETS, rangeLabel } from './presets'

interface PreviewRowProps {
  /** The selected frames, at their stored boxes. */
  frames: readonly FrameRecord[]
}

/**
 * Shows the selected frames at another width without writing anything: a
 * phone, tablet, or desktop toggle, a width that scrubs from the previewed
 * width or the stored one, and End preview. A toggle reads pressed while every
 * width shown sits in its range, and a click keeps a width already in range. Every part reads as a preview,
 * never as the frame's size, which the W field above owns.
 */
export function PreviewRow({ frames }: PreviewRowProps) {
  const previews = usePreviews()
  const refs = frames.map((frame) => frame.ref)
  const widths = frames.map(
    (frame) => previews[frame.ref]?.width ?? frame.box.width,
  )
  const previewed = refs.some((ref) => previews[ref] !== undefined)
  const width = shared(widths)

  // The previews a scrub or a step started from, which it moves each frame
  // from and an Esc puts back, since its own moves change `widths`.
  const started = useRef<{
    widths: readonly number[]
    previews: Readonly<Record<string, Preview | undefined>>
  } | null>(null)

  const show = (next: NumberChange) => {
    started.current ??= {
      widths,
      previews: Object.fromEntries(refs.map((ref) => [ref, previews[ref]])),
    }
    const from = started.current.widths
    // Mixed widths each move by the step from their own.
    for (const [index, ref] of refs.entries()) {
      const at = from[index]
      if (at !== undefined) setPreview([ref], next(at))
    }
  }

  const preview = (next: NumberChange | null) => {
    if (next) {
      show(next)
      return
    }
    const held = started.current
    started.current = null
    if (!held) return
    for (const [ref, was] of Object.entries(held.previews)) {
      if (was) setPreview([ref], was.width)
      else endPreview([ref])
    }
  }

  const commit = (next: NumberChange) => {
    show(next)
    started.current = null
  }

  return (
    <div role="group" aria-labelledby="inspector-preview" className="mt-2.5">
      <div className="mb-1.5 flex h-4 items-center justify-between">
        <span
          id="inspector-preview"
          className="text-caption text-muted-foreground"
        >
          Preview
        </span>
        {previewed ? (
          <span className="text-caption text-muted-foreground">
            Size unchanged
          </span>
        ) : null}
      </div>
      <div className="grid grid-cols-2 gap-1.5">
        <div className="flex h-[26px] gap-0.5 rounded-md bg-input p-0.5">
          {PRESETS.map(({ preset, label, icon: Icon }) => {
            const range = `${rangeLabel(preset)}, default ${FRAME_SIZES[preset].width}`
            const on =
              widths.length > 0 && widths.every((at) => presetAt(at) === preset)
            return (
              <ActionTooltip
                key={preset}
                label={`${label}, ${range}`}
                side="bottom"
              >
                <button
                  type="button"
                  aria-label={`Preview at ${label.toLowerCase()} width, ${range}`}
                  aria-pressed={on}
                  onClick={() => {
                    for (const [index, ref] of refs.entries()) {
                      const at = widths[index]
                      if (at !== undefined) {
                        setPreview([ref], previewWidth(preset, at))
                      }
                    }
                  }}
                  className={cn(
                    'grid flex-1 place-items-center rounded-[5px] text-muted-foreground outline-none hover:bg-sidebar hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring/50 active:bg-sidebar',
                    on && 'bg-sidebar text-foreground shadow-xs',
                  )}
                >
                  <Icon aria-hidden className="size-[13px]" strokeWidth={1.6} />
                </button>
              </ActionTooltip>
            )
          })}
        </div>
        <div className="relative">
          <NumberField
            prefix={
              <MoveHorizontal
                aria-hidden
                className="size-[13px]"
                strokeWidth={1.6}
              />
            }
            label="Preview width"
            value={width}
            min={1}
            format={WHOLE}
            disabled={false}
            inputClassName={previewed ? 'pr-7' : undefined}
            onPreview={preview}
            onCommit={commit}
          />
          {previewed ? (
            <span className="absolute inset-y-0 right-0.5 flex items-center">
              <ActionTooltip label="End preview" side="bottom">
                <button
                  type="button"
                  aria-label="End preview"
                  onClick={() => endPreview(refs)}
                  className="grid size-6 place-items-center rounded-[5px] text-muted-foreground outline-none hover:bg-sidebar hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring/50 active:bg-sidebar"
                >
                  <X aria-hidden className="size-[13px]" strokeWidth={1.6} />
                </button>
              </ActionTooltip>
            </span>
          ) : null}
        </div>
      </div>
    </div>
  )
}

const WHOLE: Intl.NumberFormatOptions = { maximumFractionDigits: 0 }

function shared(values: readonly number[]): number | null {
  const [first] = values
  return first !== undefined && values.every((value) => value === first)
    ? first
    : null
}
