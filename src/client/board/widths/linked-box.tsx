import { memo, useEffect, useMemo, useRef, useState } from 'react'

import { cn } from '@/client/lib/cn'
import {
  FRAME_ALLOW,
  framePageUrl,
  useFrameOrigin,
} from '@/client/live/frame-url'
import { frameTheme, useFrameTheme } from '@/client/theme/store'
import {
  BEZELS,
  insetsPage,
  pageCorners,
  railInset,
  screenCorners,
} from '@/shared/frame-device'
import { linkedBar, linkedBoxes, linkedDevice } from '@/shared/frame-widths'
import type { Finding } from '@/shared/records/check'
import type { FrameRecord } from '@/shared/records/list'

import { Bezel } from '../device/bezel'
import { usePageColors } from '../device/page-colors'
import { FINDINGS_MARK, severityOf } from '../findings/level'
import { FindingsCount } from '../findings/mark'
import { bindFrameKeys } from '../frame-keys'
import { useThemeInFrame } from '../frame-theme'
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
 * A frame's views at its listed widths, never frames, since the hit layer
 * answers a press on one as the frame and no element is picked inside.
 */
export const LinkedBoxes = memo(function LinkedBoxes({
  frame,
  live,
  version,
  findings,
}: LinkedBoxesProps) {
  const drawn = useDrawnBox(frame)
  if (frame.widths.length === 0 || frame.hidden) return null
  return linkedBoxes(drawn, frame.widths, frame).map((box) => (
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

/** One linked width: the frame's page at that width, in the device it names and the frame's theme, labelled by its width. */
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
  // The theme is read on load, as the frame's is, so a switch never restarts the page.
  const [loaded, setLoaded] = useState({ ref: frame.ref, version, live })
  if (loaded.version !== version || loaded.live !== live) {
    setLoaded({ ref: frame.ref, version, live })
  }
  const frameOrigin = useFrameOrigin()
  const src = useMemo(
    () =>
      loaded.live
        ? framePageUrl(
            frameOrigin,
            loaded.ref,
            frameTheme(loaded.ref),
            loaded.version,
          )
        : null,
    [loaded, frameOrigin],
  )

  const device = linkedDevice(frame, box.width)
  useThemeInFrame(iframe, theme, live)
  const colors = usePageColors(
    iframe,
    live && insetsPage(device, 'upright'),
    theme,
  )
  useHiddenScrollbar(iframe, live, frame.scroll)

  useEffect(() => {
    const element = iframe.current
    if (!playing || !element) return
    return bindFrameKeys(element, PLAY_KEYS, { keepTyping: false })
  }, [playing, live])

  const count = findings?.length ?? 0
  const severity = severityOf(findings ?? [])
  const label = `${frame.name} at ${box.width}`
  // The label stands past the body, as a frame's own does.
  const inset = device ? BEZELS[device].border : 0
  const bar = linkedBar(frame, box.width)
  const page = device
    ? {
        borderRadius: pageCorners(device, 'upright'),
        ...(bar ? { marginTop: bar, height: `calc(100% - ${bar}px)` } : {}),
      }
    : {}

  return (
    <div
      data-linked-width={box.width}
      data-linked-frame={frame.ref}
      className={cn(
        'absolute',
        // Every view of an entered frame takes the pointer back from the shield.
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
      <div
        className="absolute bottom-full left-0 flex origin-bottom-left items-center gap-1.5 pb-1 text-label font-normal text-muted-foreground [transform:scale(calc(1/var(--zoom,1)))]"
        style={
          inset
            ? { bottom: `calc(100% + ${inset}px)`, left: -inset }
            : undefined
        }
      >
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
          allow={FRAME_ALLOW}
          style={{ colorScheme: theme, ...page }}
          className="block size-full border-0 bg-[color:Canvas]"
        />
      ) : (
        <div
          data-placeholder
          className="size-full border border-border bg-card"
          style={device ? { borderRadius: screenCorners(device) } : undefined}
        />
      )}
      {device ? (
        <Bezel
          device={device}
          width={box.width}
          height={box.height}
          island={frame.island}
          colors={colors}
          theme={theme}
        />
      ) : null}
      {frame.scroll && live && !playing ? (
        <ScrollRail
          iframe={iframe}
          live={live}
          inset={railInset(device)}
          // The pointer marks the frame alone, so a view's rail shows while its frame is selected.
          className={selected ? undefined : 'invisible'}
        />
      ) : null}
    </div>
  )
}
