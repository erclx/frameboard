import { cn } from 'cn'
import { pointer, select } from 'd3-selection'
import { zoom, type ZoomBehavior, zoomIdentity, zoomTransform } from 'd3-zoom'
import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'

import { useCharacterKeysOn } from '@/client/actions/character-keys'
import { TAB_ID } from '@/client/live/socket'
import { liveStore } from '@/client/live/store'
import { useUnseen } from '@/client/live/unseen'
import { writeBoard } from '@/client/live/write'
import type { Finding } from '@/shared/records/check'
import type { Claim } from '@/shared/records/claims'
import type { FrameRecord, PageRecord } from '@/shared/records/list'

import { useDwell } from './changes/dwell'
import { ChangeGlow } from './changes/glow'
import { WaitingCards, WaitingDock } from './claims/waiting-card'
import { mountedRefs, type Size, type View } from './cull'
import { useElementActions } from './element/actions'
import { ElementOverlay } from './element/overlay'
import { pickElementRead } from './element/pick'
import { followReports } from './element/report'
import { readTree } from './element/tree'
import { Frame } from './frame'
import { useGeometryActions } from './geometry/actions'
import { attachGestures } from './geometry/gestures'
import { SelectionOverlay } from './geometry/overlay'
import { followPending } from './geometry/write'
import { useMenuActions } from './menus/actions'
import { CanvasMenu } from './menus/canvas'
import { followSpacePan, modeStore, useMode } from './mode'
import { NotesLayer } from './notes/markers'
import { pickAt } from './notes/pick'
import { closeNote, notesUi, useNoteTool } from './notes/tool'
import { followSelection, selectElement, selectionStore } from './selection'
import { placeFrame } from './structure/tool'
import { attachCanvas, reportHandMove, reportZoom } from './view'

const SCALE_EXTENT: [number, number] = [0.02, 4]

/** The zoom a mouse notch takes, the toolbar's own step. */
const NOTCH_STEP = 1.2

/**
 * The factor one zooming wheel event scales by. A mouse sends a line-mode
 * event or a pixel one of 50 or more per notch, which steps once whatever
 * its size, while a trackpad pinch sends many small ones that follow the
 * curve, so the pinch stays smooth.
 */
function wheelZoom(deltaY: number, deltaMode: number): number {
  if (deltaY === 0) return 1
  if (deltaMode === WheelEvent.DOM_DELTA_LINE || Math.abs(deltaY) >= 50) {
    return deltaY < 0 ? NOTCH_STEP : 1 / NOTCH_STEP
  }
  return 2 ** (-deltaY * 0.01)
}
const FIT_PADDING = 64
/** How long a gesture has to rest before the view counts as settled and the cull runs. */
const SETTLE_MS = 150
/** How long the view takes to travel to a shown frame. */
const FOCUS_MS = 400

/** Each page's view for the session, so leaving a page and coming back keeps it. */
const pageViews = new Map<string, View>()

interface CanvasProps {
  page: PageRecord
  /** Per-frame reload counters by ref, absent meaning zero. */
  reloads: Readonly<Record<string, number>>
  /** Check findings by frame ref, absent meaning none. */
  findings?: Readonly<Record<string, readonly Finding[]>>
  /** The live claims by frame ref, absent meaning nobody holds the frame. */
  claims?: Readonly<Record<string, Claim>>
  /** A frame to bring into view, as `show` asks, once it is on this page. */
  focus?: string | null
  /** Called once the view has started toward `focus`. */
  onFocused?: () => void
}

/**
 * One page's frames on a pannable, zoomable layer. Pan and zoom write the
 * layer's transform straight from the `d3-zoom` handler and never touch React
 * state, so a gesture renders nothing. Only once the view settles does React
 * hear of it, to swap frames far offscreen for placeholders. It registers
 * itself with the view controller in `view.ts`, which the chrome's zoom
 * controls call.
 */
export function Canvas({
  page,
  reloads,
  findings,
  claims,
  focus,
  onFocused,
}: CanvasProps) {
  const viewportRef = useRef<HTMLDivElement>(null)
  const layerRef = useRef<HTMLDivElement>(null)
  const hitRef = useRef<HTMLDivElement>(null)
  const notesLayerRef = useRef<HTMLDivElement>(null)
  // The markers read the live frames, so they render again once the layer exists.
  const [layer, setLayer] = useState<HTMLDivElement | null>(null)
  const moveToRef = useRef<((view: View) => void) | null>(null)
  const picks = useRef(0)
  const playing = useMode((state) => state.mode === 'play')
  const hand = useMode((state) => state.tool === 'hand')
  const noting = useMode((state) => state.tool === 'note')
  const framing = useMode((state) => state.tool === 'frame')
  const spacePan = useMode((state) => state.spacePan)
  useEffect(() => followSpacePan(window), [])
  useNoteTool()
  const unseen = useUnseen((state) => state.unseen)
  const [settled, setSettled] = useState<{ view: View; size: Size } | null>(
    null,
  )
  const frames = useMemo(
    () => page.frames.filter((frame) => !frame.hidden),
    [page.frames],
  )
  // Read by the zoom effect for the first fit and by the gestures at each
  // press, so a frame change rebinds neither.
  const framesRef = useRef(frames)
  useLayoutEffect(() => {
    framesRef.current = frames
  }, [frames])
  // Ahead of the geometry keys, so Esc goes up from an element before it clears.
  useElementActions(page.ref)
  useGeometryActions(page.ref, frames)
  useMenuActions(
    page.ref,
    page.frames,
    (ref) =>
      layerRef.current?.querySelector<HTMLIFrameElement>(
        `[data-frame="${CSS.escape(ref)}"] iframe`,
      )?.dataset.renderedAt ?? null,
  )

  useLayoutEffect(() => {
    const viewport = viewportRef.current
    const layer = layerRef.current
    if (!viewport || !layer) return
    const selection = select(viewport)
    let timer: ReturnType<typeof setTimeout> | undefined
    // Set while the canvas moves the view itself, so every other zoom event
    // is the developer's. `sourceEvent` cannot tell them apart, since the
    // wheel and the pan keys go through `translateBy` and carry none.
    let travelling = false

    const settle = (view: View) => setSettled({ view, size: sizeOf(viewport) })

    const zoomer: ZoomBehavior<HTMLDivElement, unknown> = zoom<
      HTMLDivElement,
      unknown
    >()
      .scaleExtent(SCALE_EXTENT)
      // A primary-button drag pans under the Hand tool, in Play, and while
      // Space is held, since in Move it selects. The middle button and the
      // wheel always pan.
      .filter((event: MouseEvent | WheelEvent | TouchEvent) => {
        if (event.type === 'wheel' || event.type.startsWith('touch')) {
          return true
        }
        const { button, ctrlKey } = event as MouseEvent
        if (ctrlKey) return false
        const { mode, tool, spacePan } = modeStore.getState()
        return (
          button === 1 ||
          (button === 0 && (tool === 'hand' || mode === 'play' || spacePan))
        )
      })
      .on('zoom', ({ transform: { x, y, k } }) => {
        clearTimeout(timer)
        for (const moved of [layer, notesLayerRef.current]) {
          if (!moved) continue
          moved.style.transform = `translate(${x}px, ${y}px) scale(${k})`
          moved.style.setProperty('--zoom', String(k))
        }
        pageViews.set(page.ref, { x, y, k })
        reportZoom(k)
        if (!travelling) reportHandMove()
      })
      .on('end', ({ transform: { x, y, k } }) => {
        clearTimeout(timer)
        timer = setTimeout(() => settle({ x, y, k }), SETTLE_MS)
      })

    selection
      .call(zoomer)
      .on('dblclick.zoom', null)
      // A plain wheel pans and a pinch, which browsers send as a wheel with
      // ctrlKey, zooms, as design tools do, rather than d3's wheel-zooms.
      .on(
        'wheel.zoom',
        (event: WheelEvent) => {
          event.preventDefault()
          const k = zoomTransform(viewport).k
          const unit = event.deltaMode === WheelEvent.DOM_DELTA_LINE ? 16 : 1
          if (event.ctrlKey || event.metaKey) {
            zoomer.scaleBy(
              selection,
              wheelZoom(event.deltaY, event.deltaMode),
              pointer(event, viewport),
            )
          } else {
            zoomer.translateBy(
              selection,
              (-event.deltaX * unit) / k,
              (-event.deltaY * unit) / k,
            )
          }
        },
        { passive: false },
      )

    let animation = 0
    const apply = ({ x, y, k }: View) => {
      travelling = true
      try {
        zoomer.transform(selection, zoomIdentity.translate(x, y).scale(k))
      } finally {
        travelling = false
      }
    }

    const start =
      pageViews.get(page.ref) ?? fitView(framesRef.current, sizeOf(viewport))
    apply(start)
    clearTimeout(timer)
    settle(start)

    const resize = new ResizeObserver(() =>
      settle(pageViews.get(page.ref) ?? start),
    )
    resize.observe(viewport)

    moveToRef.current = (target) => {
      cancelAnimationFrame(animation)
      if (matchMedia('(prefers-reduced-motion: reduce)').matches) {
        apply(target)
        return
      }
      const from = zoomTransform(viewport)
      const began = performance.now()
      const step = (now: number) => {
        const t = Math.min(1, (now - began) / FOCUS_MS)
        if (t === 1) {
          apply(target)
          return
        }
        const eased = t < 0.5 ? 4 * t ** 3 : 1 - (-2 * t + 2) ** 3 / 2
        apply({
          x: from.x + (target.x - from.x) * eased,
          y: from.y + (target.y - from.y) * eased,
          // Scale travels evenly in ratio, so zooming in and out read alike.
          k: from.k * (target.k / from.k) ** eased,
        })
        animation = requestAnimationFrame(step)
      }
      animation = requestAnimationFrame(step)
    }

    // A press anywhere on the canvas is the developer taking the view.
    const press = () => reportHandMove()
    viewport.addEventListener('pointerdown', press, { capture: true })

    const detach = attachCanvas(
      {
        zoomBy: (factor) => zoomer.scaleBy(selection, factor),
        zoomTo: (scale) => zoomer.scaleTo(selection, scale),
        // The toolbar's fit is the developer's, though the canvas travels it.
        fit: () => {
          reportHandMove()
          moveToRef.current?.(fitView(framesRef.current, sizeOf(viewport)))
        },
        fitTo: (boxes) => {
          reportHandMove()
          moveToRef.current?.(
            fitView(
              boxes.map((box) => ({ box })),
              sizeOf(viewport),
            ),
          )
        },
        panBy: (dx, dy) => {
          const k = zoomTransform(viewport).k
          zoomer.translateBy(selection, -dx / k, -dy / k)
        },
        centerOn: (box) =>
          moveToRef.current?.(
            centerView(box, zoomTransform(viewport).k, sizeOf(viewport)),
          ),
      },
      page.ref,
    )

    return () => {
      viewport.removeEventListener('pointerdown', press, { capture: true })
      detach()
      clearTimeout(timer)
      cancelAnimationFrame(animation)
      moveToRef.current = null
      resize.disconnect()
      selection.on('.zoom', null)
    }
  }, [page.ref])

  useEffect(() => {
    const stopSelection = followSelection(
      selectionStore,
      page.ref,
      liveStore,
      modeStore,
    )
    const stopPending = followPending(liveStore)
    const stopReports = followReports(
      selectionStore,
      liveStore,
      TAB_ID,
      (report) => writeBoard('/api/selection', report),
    )
    return () => {
      stopReports()
      stopPending()
      stopSelection()
    }
  }, [page.ref])

  // Play lifts the hit layer, so the gestures bind again each time it returns.
  useEffect(() => {
    const viewport = viewportRef.current
    const layer = layerRef.current
    const hit = hitRef.current
    if (!viewport || !layer || !hit) return
    return attachGestures(hit, {
      viewport,
      layer,
      page: page.ref,
      frames: () => framesRef.current,
    })
  }, [page.ref, playing])

  // Waits for the frame to reach this page's record, since a shown frame can
  // arrive a batch ahead of the board that holds it.
  useEffect(() => {
    const frame = frames.find((candidate) => candidate.ref === focus)
    const viewport = viewportRef.current
    if (!frame || !viewport || !moveToRef.current) return
    moveToRef.current(fitView([frame], sizeOf(viewport)))
    onFocused?.()
  }, [focus, frames, onFocused])

  const pickInside = (event: MouseEvent) => {
    const viewport = viewportRef.current
    // Only the Move tool selects, so the Hand, Note, and Frame tools pick nothing.
    if (noting || hand || framing || !viewport || !layer) return
    const [x, y] = zoomTransform(viewport).invert(pointer(event, viewport))
    // A pick waiting on its frame's tree yields to any click made after it.
    const turn = ++picks.current
    void pickElementRead(layer, frames, { x, y }, readTree).then((element) => {
      if (element && turn === picks.current) {
        selectElement(selectionStore, page.ref, element)
      }
    })
  }

  const live = useMemo(
    () => (settled ? mountedRefs(frames, settled.view, settled.size) : null),
    [frames, settled],
  )
  // The dwell reads what is on screen each time the cull runs.
  useDwell(
    useMemo(() => (settled ? { frames, ...settled } : null), [frames, settled]),
  )

  return (
    <div
      ref={viewportRef}
      data-canvas
      className={cn(
        'relative size-full touch-none overflow-hidden bg-background',
        (noting || framing) && !playing && 'cursor-crosshair',
        (spacePan || (hand && !playing)) &&
          'cursor-grab active:cursor-grabbing',
      )}
    >
      <div
        ref={(element) => {
          layerRef.current = element
          setLayer(element)
        }}
        data-layer
        className="absolute top-0 left-0 origin-top-left"
      >
        {page.layoutError ? null : (
          <>
            {frames.map((frame) => (
              <Frame
                key={frame.ref}
                frame={frame}
                live={live?.has(frame.ref) ?? false}
                version={reloads[frame.ref] ?? 0}
                findings={findings?.[frame.ref]}
                claim={claims?.[frame.ref]}
                unseen={frame.ref in unseen}
              />
            ))}
            <SelectionOverlay frames={frames} />
            <ElementOverlay frames={frames} container={layer} />
            <ChangeGlow frames={frames} container={layer} />
            <WaitingCards page={page.ref} frames={frames} />
          </>
        )}
      </div>
      {/* Covers every frame in Edit, so a press over one reaches the
          gestures rather than its page. Play lifts it, so a click reaches
          the frame. */}
      {playing ? null : (
        <CanvasMenu
          page={page.ref}
          frames={() => framesRef.current}
          viewport={viewportRef}
          layer={layerRef}
          trigger={
            <div
              ref={hitRef}
              data-hit-layer
              className="absolute inset-0"
              // A Note click opens the composer and a Frame click places a
              // frame, and either goes no further. Selection and marquee
              // gestures start on pointerdown, so they bind only while the Move
              // tool is on and never see either press.
              onClickCapture={(event) => {
                const viewport = viewportRef.current
                if (!(noting || framing) || !viewport || !layer) return
                event.stopPropagation()
                const [x, y] = zoomTransform(viewport).invert(
                  pointer(event.nativeEvent, viewport),
                )
                if (framing) {
                  void placeFrame(
                    { x, y },
                    { page: page.ref, frames: page.frames },
                  )
                  return
                }
                const pick = pickAt(layer, frames, { x, y })
                if (pick) notesUi.setState({ open: { kind: 'new', pick } })
                else closeNote()
              }}
              // The gestures select the frame on pointerup and the click follows,
              // so a Cmd-click or a double-click picks inside the frame just selected.
              onClick={(event) => {
                if (event.metaKey) pickInside(event.nativeEvent)
              }}
              onDoubleClick={(event) => pickInside(event.nativeEvent)}
            />
          }
        />
      )}
      <div
        ref={notesLayerRef}
        data-notes-layer
        className="pointer-events-none absolute top-0 left-0 origin-top-left"
      >
        <NotesLayer page={page.ref} frames={frames} container={layer} />
      </div>
      <WaitingDock frames={frames} />
      {page.layoutError ? (
        <LayoutErrorNotice error={page.layoutError} />
      ) : frames.length === 0 ? (
        <EmptyNotice />
      ) : null}
    </div>
  )
}

function LayoutErrorNotice({
  error,
}: {
  error: NonNullable<PageRecord['layoutError']>
}) {
  return (
    <div className="pointer-events-none absolute inset-0 flex items-center justify-center p-6">
      <div
        role="alert"
        className="max-w-md rounded-lg border border-border bg-card p-4 text-body text-card-foreground"
      >
        <p className="text-panel">This page's layout does not read</p>
        <p className="mt-1 break-all text-muted-foreground">{error.path}</p>
        <p className="mt-2">{error.message}</p>
      </div>
    </div>
  )
}

function EmptyNotice() {
  const keysOn = useCharacterKeysOn()
  return (
    <div
      role="status"
      className="pointer-events-none absolute top-1/2 left-1/2 w-105 max-w-[calc(100%-2rem)] -translate-x-1/2 -translate-y-[55%] text-center text-body leading-[1.6] text-muted-foreground"
    >
      <div
        aria-hidden
        className="mx-auto mb-3.5 h-12 w-16 rounded-lg border-[1.5px] border-dashed border-faint"
      />
      <p className="mb-1 text-sm font-semibold text-foreground">
        This page has no frames
      </p>
      <p>
        Pick the Frame tool{' '}
        {keysOn ? (
          <>
            <kbd className="rounded-[5px] bg-muted px-1.5 py-0.5 font-mono text-label font-normal text-foreground">
              F
            </kbd>{' '}
          </>
        ) : null}
        and click on the canvas,
        <br />
        or ask your agent to draw one.
      </p>
    </div>
  )
}

/**
 * The view centering a box at scale `k`, or fitting it when it does not fit
 * the viewport at that scale, so following an agent keeps the developer's zoom.
 */
function centerView(box: FrameRecord['box'], k: number, size: Size): View {
  if (
    box.width * k > size.width - 2 * FIT_PADDING ||
    box.height * k > size.height - 2 * FIT_PADDING
  ) {
    return fitView([{ box }], size)
  }
  return {
    x: size.width / 2 - (box.x + box.width / 2) * k,
    y: size.height / 2 - (box.y + box.height / 2) * k,
    k,
  }
}

function sizeOf(element: HTMLElement): Size {
  return { width: element.clientWidth, height: element.clientHeight }
}

/** The view that shows every frame, never zoomed past 100 percent. */
function fitView(
  frames: readonly Pick<FrameRecord, 'box'>[],
  size: Size,
): View {
  if (frames.length === 0 || size.width === 0 || size.height === 0) {
    return { x: FIT_PADDING, y: FIT_PADDING, k: 1 }
  }
  const left = Math.min(...frames.map(({ box }) => box.x))
  const top = Math.min(...frames.map(({ box }) => box.y))
  const right = Math.max(...frames.map(({ box }) => box.x + box.width))
  const bottom = Math.max(...frames.map(({ box }) => box.y + box.height))
  const k = Math.min(
    (size.width - 2 * FIT_PADDING) / (right - left),
    (size.height - 2 * FIT_PADDING) / (bottom - top),
    1,
  )
  const scale = Math.max(SCALE_EXTENT[0], k)
  return {
    x: (size.width - (right - left) * scale) / 2 - left * scale,
    y: (size.height - (bottom - top) * scale) / 2 - top * scale,
    k: scale,
  }
}
