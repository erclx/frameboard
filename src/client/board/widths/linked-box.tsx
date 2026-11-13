import { memo, useEffect, useMemo, useRef, useState } from 'react'

import { bindKeys } from '@/client/actions/registry'
import { cn } from '@/client/lib/cn'
import { frameTheme, useFrameTheme } from '@/client/theme/store'
import { linkedBoxes } from '@/shared/frame-widths'
import type { Finding } from '@/shared/records/check'
import type { FrameRecord } from '@/shared/records/list'
import { frameThemeUrl, setFrameTheme } from '@/shared/theme'

import { FINDINGS_MARK, severityOf } from '../findings/level'
import { FindingsCount } from '../findings/mark'
import { useDrawnBox } from '../geometry/write'
import { useHiddenScrollbar } from '../hidden-scrollbar'
import { useMode } from '../mode'
import { useEntered } from '../play/entered'
import { ScrollRail } from '../scroll/rail'
import { useSelection } from '../selection'

/** The keys a linked box's window hands the board in Play, as its frame's does. */
const PLAY_KEYS = ['Escape']

interface LinkedBoxesProps {
  frame: FrameRecord
  /** False for a frame far offscreen, whose linked boxes draw placeholders too. */
  live: boolean
  /** The frame's reload count, so an agent's write reloads every view of it. */
  version: number
  /** The frame's findings, each linked box counting those read at its width. */
  findings?: readonly Finding[]
}

/**
 * The views of a frame at each width it lists, in a row past its drawn box,
 * moving with it while a drag holds it. They are views and never frames: the
 * hit layer answers a press on one as the frame, so selection, notes, and
 * drags stay on the frame, and no element is picked inside one.
 */
export const LinkedBoxes = memo(function LinkedBoxes({
  frame,
  live,
  version,
  findings,
}: LinkedBoxesProps) {
  const drawn = useDrawnBox(frame)
  if (frame.widths.length === 0 || frame.hidden) return null
  return linkedBoxes(drawn, frame.widths).map((box) => (
    <LinkedBox
      key={box.width}
      frame={frame}
      box={box}
      live={live}
      version={version}
      findings={findings?.filter((finding) => finding.width === box.width)}
    />
  ))
})

interface LinkedBoxProps {
  frame: FrameRecord
  box: { x: number; y: number; width: number; height: number }
  live: boolean
  version: number
  /** The findings read at this box's width alone. */
  findings?: readonly Finding[]
}

/** One linked width: the frame's page at that width, in the frame's theme, labelled by its width. */
export function LinkedBox({
  frame,
  box,
  live,
  version,
  findings,
}: LinkedBoxProps) {
  const iframe = useRef<HTMLIFrameElement>(null)
  const theme = useFrameTheme(frame.ref)
  const playing = useMode((state) => state.mode === 'play')
  const entered = useEntered(frame.ref) && playing
  const selected = useSelection((state) => state.frames.includes(frame.ref))
  // As the frame does, the theme is read on mount and reload alone, and a
  // switch rewrites the root rather than restarting the page.
  const [loaded, setLoaded] = useState({ ref: frame.ref, version, live })
  if (loaded.version !== version || loaded.live !== live) {
    setLoaded({ ref: frame.ref, version, live })
  }
  const src = useMemo(
    () =>
      loaded.live
        ? frameThemeUrl(loaded.ref, frameTheme(loaded.ref), loaded.version)
        : null,
    [loaded],
  )

  useEffect(() => {
    const element = iframe.current
    if (!live || !element) return
    const write = () => {
      const root = element.contentDocument?.documentElement
      if (root) setFrameTheme(root, theme)
    }
    write()
    element.addEventListener('load', write)
    return () => element.removeEventListener('load', write)
  }, [theme, live])

  useHiddenScrollbar(iframe, live, frame.scroll)

  useEffect(() => {
    const element = iframe.current
    if (!playing || !element) return
    let unbind = () => {}
    const bind = () => {
      unbind()
      const target = element.contentWindow
      unbind = target ? bindKeys(target, PLAY_KEYS) : () => {}
    }
    bind()
    element.addEventListener('load', bind)
    return () => {
      element.removeEventListener('load', bind)
      unbind()
    }
  }, [playing, live])

  const count = findings?.length ?? 0
  const severity = severityOf(findings ?? [])
  const label = `${frame.name} at ${box.width}`

  return (
    <div
      data-linked-width={box.width}
      data-linked-frame={frame.ref}
      className={cn(
        'absolute',
        // An entered frame is played in every view of it, each taking the
        // pointer back from the shield as the frame's own box does.
        entered && 'pointer-events-auto',
      )}
      style={{
        left: box.x,
        top: box.y,
        width: box.width,
        height: box.height,
        zIndex: frame.order,
      }}
    >
      <div className="absolute bottom-full left-0 flex origin-bottom-left items-center gap-1.5 pb-1 text-label font-normal text-muted-foreground [transform:scale(calc(1/var(--zoom,1)))]">
        <span className="tabular-nums">{box.width}</span>
        {count > 0 ? (
          <span
            role="img"
            aria-label={`${count} check finding${count === 1 ? '' : 's'} at ${box.width}`}
            data-severity={severity}
            className={FINDINGS_MARK}
          >
            <FindingsCount count={count} severity={severity} />
          </span>
        ) : null}
      </div>
      {live ? (
        <iframe
          ref={iframe}
          title={label}
          src={src ?? undefined}
          style={{ colorScheme: theme }}
          className="block size-full border-0 bg-[color:Canvas]"
        />
      ) : (
        <div
          data-placeholder
          className="size-full border border-border bg-card"
        />
      )}
      {frame.scroll && live && !playing ? (
        <ScrollRail
          iframe={iframe}
          live={live}
          // The pointer marks the frame alone, so a view's rail shows while its frame is selected.
          className={selected ? undefined : 'invisible'}
        />
      ) : null}
    </div>
  )
}
