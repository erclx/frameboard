import { cn } from 'cn'
import { type LucideIcon, Monitor, Smartphone, Tablet } from 'lucide-react'

import { useLive } from '@/client/live/store'
import { FRAME_SIZES, type FrameSizePreset } from '@/shared/frame-sizes'

import { useAuthor } from '../chrome/author'
import { AvatarMenu } from '../chrome/avatar-menu'
import { ZoomControl } from '../chrome/zoom-control'
import { usePendingFrames } from '../geometry/write'
import { useMode } from '../mode'
import { useSelection } from '../selection'
import { choosePreset, usePreset } from '../structure/tool'
import { ArrangeSection } from './arrange-section'
import { FrameSection } from './frame-section'

/**
 * The right panel: the header of the avatar and the zoom level, over the
 * Frame tool's presets while that tool is on, else the Frame section for
 * one selected frame, or the `N frames` section and Arrange for several,
 * and a hint while nothing is selected.
 */
export function InspectorPanel() {
  const name = useAuthor() ?? null
  const playing = useMode((state) => state.mode === 'play')
  const framing = useMode(
    (state) => state.mode === 'edit' && state.tool === 'frame',
  )
  const page = useSelection((state) => state.page)
  const refs = useSelection((state) => state.frames)
  const shown = useLive((state) =>
    state.board?.projects
      .flatMap((project) => project.pages)
      .find((candidate) => candidate.ref === page),
  )
  const frames = usePendingFrames(
    shown?.frames.filter((frame) => refs.includes(frame.ref)) ?? [],
  )
  return (
    <aside
      aria-label="Inspector"
      className="flex h-full min-w-0 flex-col bg-sidebar text-body text-sidebar-foreground"
    >
      <div className="flex h-11 shrink-0 items-center justify-between border-b border-sidebar-border px-3">
        <AvatarMenu name={name} />
        <ZoomControl />
      </div>
      {framing ? (
        <PresetSection />
      ) : page && frames.length > 0 ? (
        <>
          <FrameSection page={page} frames={frames} />
          {frames.length > 1 ? <ArrangeSection /> : null}
        </>
      ) : (
        <div className="px-3 pt-2.5 pb-3 text-muted-foreground">
          {playing ? (
            <p>Playing. Nothing selects while frames take the clicks.</p>
          ) : (
            <>
              <p>Select a frame to see its details.</p>
              <p className="mt-4">
                Click a frame, or drag on the canvas to select several.
              </p>
            </>
          )}
        </div>
      )}
    </aside>
  )
}

const PRESETS: readonly {
  preset: FrameSizePreset
  label: string
  icon: LucideIcon
}[] = [
  { preset: 'phone', label: 'Phone', icon: Smartphone },
  { preset: 'tablet', label: 'Tablet', icon: Tablet },
  { preset: 'desktop', label: 'Desktop', icon: Monitor },
]

/** The sizes the Frame tool places, one chosen at a time, the next canvas click placing it. */
function PresetSection() {
  const chosen = usePreset()
  return (
    <section
      aria-labelledby="inspector-presets"
      className="border-b border-sidebar-border px-3 pt-2.5 pb-3"
    >
      <h2 id="inspector-presets" className="mb-2 text-xs font-semibold">
        Frame
      </h2>
      <div
        role="radiogroup"
        aria-labelledby="inspector-presets"
        className="-mx-1.5 flex flex-col"
      >
        {PRESETS.map(({ preset, label, icon: Icon }) => {
          const { width, height } = FRAME_SIZES[preset]
          return (
            <button
              key={preset}
              type="button"
              role="radio"
              aria-checked={preset === chosen}
              onClick={() => choosePreset(preset)}
              className={cn(
                'flex h-[26px] items-center gap-1.5 rounded-md px-1.5 text-left outline-none hover:bg-accent focus-visible:ring-2 focus-visible:ring-ring/50',
                preset === chosen && 'bg-accent',
              )}
            >
              <Icon
                aria-hidden
                className="size-[13px] text-muted-foreground"
                strokeWidth={1.6}
              />
              <span className="flex-1">{label}</span>
              <span className="text-muted-foreground tabular-nums">
                {width} × {height}
              </span>
            </button>
          )
        })}
      </div>
      <p className="mt-2 text-muted-foreground">
        Click on the canvas to place it.
      </p>
    </section>
  )
}
