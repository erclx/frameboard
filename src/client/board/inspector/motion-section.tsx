import { useState } from 'react'
import { useStore } from 'zustand'

import { Button } from '@/client/components/ui/button'
import { maxFilmstripCount } from '@/shared/capture-limits'
import type { FrameRecord } from '@/shared/records/list'

import { PlayButton, SeekTrack } from '../element/media-bar'
import { reportRefusal } from '../left-panel/page-actions'
import { type FrameMotion, liveMomentOf, useFrameMotion } from '../motion/seek'
import {
  formatMoment,
  holdMotion,
  type MotionHold,
  playMotion,
  useMotionHold,
} from '../motion/store'
import { ExportMenu } from './export-section'
import {
  exportFilmstrip,
  exportStore,
  filmstripFileNames,
} from './export-store'

/** The frame counts a filmstrip takes, 5 unless picked, past which the board offers only those that fit. */
const COUNTS = [2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12] as const
const DEFAULT_COUNT = 5

/**
 * The Motion section for one selected frame whose live page runs a timeline,
 * absent for a still one: play, the time, and the scrub track, each moving
 * the live page in this tab and writing nothing, then the Filmstrip row,
 * exporting at the Export section's scale and theme.
 */
export function MotionSection({ frame }: { frame: FrameRecord }) {
  const found = useFrameMotion(frame.ref)
  const hold = useMotionHold(frame.ref)
  if (!found) return null
  return <MotionControls frame={frame} found={found} hold={hold} />
}

interface MotionControlsProps {
  frame: FrameRecord
  found: FrameMotion
  hold: MotionHold | undefined
}

function MotionControls({ frame, found, hold }: MotionControlsProps) {
  const { span } = found
  // A frame the board does not drive runs on its own clock, so it reads as playing.
  const playing = hold?.playing ?? true
  const at = hold ? Math.min(hold.at, span) : null
  const control = {
    reading: { paused: !playing, time: (at ?? 0) / 1000, length: span / 1000 },
    togglePlay: () => {
      if (!playing) playMotion(frame.ref)
      else holdMotion(frame.ref, at ?? liveMomentOf(frame.ref, found))
    },
    seek: (seconds: number) => holdMotion(frame.ref, seconds * 1000),
  }

  return (
    <section
      aria-labelledby="inspector-motion"
      className="border-b border-sidebar-border px-3 pt-2.5 pb-3"
    >
      <h2 id="inspector-motion" className="mb-2 text-xs font-semibold">
        Motion
      </h2>
      <div className="flex items-center gap-1.5">
        <PlayButton media={control} className="size-6 bg-muted" />
        <span className="shrink-0 font-mono text-[10px] text-muted-foreground tabular-nums">
          {at === null ? '–' : formatMoment(at)} / {formatMoment(span)} s
        </span>
      </div>
      <SeekTrack
        media={control}
        format={(seconds) => `${formatMoment(seconds * 1000)} s`}
        className="mt-2 w-full"
      />
      <FilmstripRow frame={frame} unbounded={found.motion.duration === null} />
    </section>
  )
}

function FilmstripRow({
  frame,
  unbounded,
}: {
  frame: FrameRecord
  unbounded: boolean
}) {
  const scale = useStore(exportStore, (state) => state.scale)
  const theme = useStore(exportStore, (state) => state.theme)
  const [picked, setPicked] = useState<number>(DEFAULT_COUNT)
  const [exporting, setExporting] = useState(false)
  // Only the counts whose strip the screenshot surface holds at this scale,
  // so a pick never refuses after a round trip. A raised scale lowers a
  // pick past the new cap to the cap rather than to the default.
  const fitting = COUNTS.filter(
    (one) => one <= maxFilmstripCount(frame.box.width, scale),
  )
  const count = Math.min(picked, fitting.at(-1) ?? picked)
  const tooWide = fitting.length === 0
  const files = filmstripFileNames(frame.name, count, { scale, theme })

  const run = () => {
    setExporting(true)
    void exportFilmstrip(frame, count, { scale, theme })
      .catch(reportRefusal(`Couldn't export a filmstrip of ${frame.name}`))
      .finally(() => setExporting(false))
  }

  return (
    <div role="group" aria-labelledby="inspector-filmstrip" className="mt-2.5">
      <div className="mb-1.5 flex h-4 items-center">
        <span
          id="inspector-filmstrip"
          className="text-caption text-muted-foreground"
        >
          Filmstrip
        </span>
      </div>
      <div className="mb-2 grid">
        <ExportMenu
          label="Filmstrip frames"
          shown={`${count} frames`}
          value={String(count)}
          options={fitting.map((one) => ({
            value: String(one),
            label: `${one} frames`,
          }))}
          onPick={(value) => setPicked(Number(value))}
        />
      </div>
      <Button
        variant="outline"
        size="sm"
        disabled={exporting || unbounded || tooWide}
        onClick={run}
        className="w-full bg-transparent text-xs dark:bg-transparent"
      >
        {exporting ? 'Exporting' : 'Export filmstrip'}
      </Button>
      <p className="mt-1.5 text-caption text-muted-foreground">
        {unbounded
          ? 'Its animations repeat forever, so a filmstrip has no end to space its frames across.'
          : tooWide
            ? `Too wide for two frames in a row at ${scale}x. Pick a smaller scale under Export.`
            : `PNG, ${files.join(' and ')}`}
      </p>
    </div>
  )
}
