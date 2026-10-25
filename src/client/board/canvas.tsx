import { cn } from 'cn'
import { pointer, select } from 'd3-selection'
import { zoom, type ZoomBehavior, zoomIdentity, zoomTransform } from 'd3-zoom'
import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'

import { useCharacterKeysOn } from '@/client/actions/character-keys'
import { findAction, isEnabled } from '@/client/actions/registry'
import { TAB_ID } from '@/client/live/socket'
import { liveStore, useLive } from '@/client/live/store'
import { type Structure, structure } from '@/client/live/structure'
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
import { drawnAt, frameAt } from './geometry/hit'
import { SelectionOverlay } from './geometry/overlay'
import { followPending, withDrawn } from './geometry/write'
import { GuideCard } from './guide/card'
import { useShowsGuide } from './guide/state'
import { labelRoom, markCrowded, markHovered } from './label-room'
import { reportRefusal } from './left-panel/page-actions'
import { useMenuActions } from './menus/actions'
import { CanvasMenu } from './menus/canvas'
import { followSpacePan, modeStore, useMode } from './mode'
import { NotesLayer } from './notes/markers'
import { pickAt } from './notes/pick'
import { closeNote, notesUi, useNoteTool } from './notes/tool'
import { followSelection, selectElement, selectionStore } from './selection'
import { placeFrame } from './structure/tool'
import { attachCanvas, reportHandMove, reportZoom } from './view'
import { isNotch, PAN_EASE_MS, panEase, wheelPixels, wheelZoom } from './wheel'

const SCALE_EXTENT: [number, number] = [0.02, 4]

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
  /** The server calls the empty page's Show writes through, the board's own when absent. */
  calls?: Structure
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
  calls = structure,
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
  // Read by the zoom handler, which marks crowded labels with no render.
  const rooms = useMemo(() => labelRoom(frames), [frames])
  const roomsRef = useRef(rooms)
  useLayoutEffect(() => {
    roomsRef.current = rooms
    const viewport = viewportRef.current
    const layer = layerRef.current
    if (viewport && layer) markCrowded(layer, rooms, zoomTransform(viewport).k)
  }, [rooms])
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
        markCrowded(layer, roomsRef.current, k)
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
          if (event.ctrlKey || event.metaKey) {
            zoomer.scaleBy(
              selection,
              wheelZoom(event.deltaY, event.deltaMode),
              pointer(event, viewport),
            )
            return
          }
          // Each axis reads alone, so a notch glides and a trackpad's small
          // deltas follow the fingers one to one.
          // Shift turns a wheel sideways, which macOS sends as deltaX and
          // Chromium on Linux leaves on deltaY.
          const sideways = event.shiftKey && event.deltaX === 0
          const deltaX = sideways ? event.deltaY : event.deltaX
          const deltaY = sideways ? 0 : event.deltaY
          const { deltaMode } = event
          const dx = -wheelPixels(deltaX, deltaMode)
          const dy = -wheelPixels(deltaY, deltaMode)
          const notchX = isNotch(deltaX, deltaMode)
          const notchY = isNotch(deltaY, deltaMode)
          panScreen(notchX ? 0 : dx, notchY ? 0 : dy)
          if (notchX || notchY) glideBy(notchX ? dx : 0, notchY ? dy : 0)
        },
        { passive: false },
      )

    let animation = 0
    const panScreen = (dx: number, dy: number) => {
      if (dx === 0 && dy === 0) return
      const k = zoomTransform(viewport).k
      zoomer.translateBy(selection, dx / k, dy / k)
    }

    // A notch's pan, held in screen pixels so a zoom mid-glide moves nothing.
    // A notch arriving mid-glide adds to what is left and starts it again.
    let glide = 0
    let left = { x: 0, y: 0 }
    const stopGlide = () => {
      cancelAnimationFrame(glide)
      left = { x: 0, y: 0 }
    }
    const glideBy = (dx: number, dy: number) => {
      // The developer took the view from any travel under way.
      cancelAnimationFrame(animation)
      if (matchMedia('(prefers-reduced-motion: reduce)').matches) {
        panScreen(dx, dy)
        return
      }
      cancelAnimationFrame(glide)
      const total = { x: left.x + dx, y: left.y + dy }
      left = total
      const began = performance.now()
      let covered = 0
      const step = (now: number) => {
        const share = panEase(
          Math.min(1, Math.max(0, now - began) / PAN_EASE_MS),
        )
        panScreen(total.x * (share - covered), total.y * (share - covered))
        covered = share
        left = { x: total.x * (1 - share), y: total.y * (1 - share) }
        if (share < 1) glide = requestAnimationFrame(step)
      }
      glide = requestAnimationFrame(step)
    }
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
      stopGlide()
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
    const press = () => {
      stopGlide()
      reportHandMove()
    }
    viewport.addEventListener('pointerdown', press, { capture: true })

    // The hit layer covers every frame, so the frame under the pointer is
    // found by geometry and marked, which shows its label while crowded.
    let hovered: string | null = null
    const hover = (ref: string | null) => {
      if (ref === hovered) return
      hovered = ref
      markHovered(layer, ref)
    }
    const track = (event: PointerEvent) => {
      const transform = zoomTransform(viewport)
      const [x, y] = transform.invert(pointer(event, viewport))
      hover(
        frameAt(withDrawn(framesRef.current), { x, y }, transform.k)?.ref ??
          null,
      )
    }
    const leave = () => hover(null)
    viewport.addEventListener('pointermove', track)
    viewport.addEventListener('pointerleave', leave)

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
        centerOn: (box, scale) =>
          moveToRef.current?.(
            centerView(
              box,
              scale ?? zoomTransform(viewport).k,
              sizeOf(viewport),
            ),
          ),
        visible: () => {
          const transform = zoomTransform(viewport)
          const { width, height } = sizeOf(viewport)
          const [x, y] = transform.invert([0, 0])
          return {
            x,
            y,
            width: width / transform.k,
            height: height / transform.k,
          }
        },
      },
      page.ref,
    )

    return () => {
      viewport.removeEventListener('pointerdown', press, { capture: true })
      viewport.removeEventListener('pointermove', track)
      viewport.removeEventListener('pointerleave', leave)
      detach()
      clearTimeout(timer)
      cancelAnimationFrame(animation)
      cancelAnimationFrame(glide)
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
    void pickElementRead(layer, withDrawn(frames), { x, y }, readTree).then(
      (element) => {
        if (element && turn === picks.current) {
          selectElement(selectionStore, page.ref, element)
        }
      },
    )
  }

  /**
   * Whether a double-click landed in a frame's label strip, off its theme
   * and compare controls, which click on release and would click twice. The
   * first click selected the frame, so the label renames only that frame.
   */
  const onLabel = (event: MouseEvent): boolean => {
    const viewport = viewportRef.current
    if (noting || hand || framing || !viewport || !layer) return false
    if (drawnAt(layer, '[data-label-control]', event)) return false
    const transform = zoomTransform(viewport)
    const [x, y] = transform.invert(pointer(event, viewport))
    const frame = frameAt(withDrawn(frames), { x, y }, transform.k)
    const chosen = selectionStore.getState()
    return (
      frame !== null &&
      y < frame.box.y &&
      chosen.page === page.ref &&
      chosen.frames.length === 1 &&
      chosen.frames[0] === frame.ref
    )
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
          // A right-click hits the frames where they draw, as a press does.
          frames={() => withDrawn(framesRef.current)}
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
                const transform = zoomTransform(viewport)
                const [x, y] = transform.invert(
                  pointer(event.nativeEvent, viewport),
                )
                if (framing) {
                  const size = sizeOf(viewport)
                  const [left, top] = transform.invert([0, 0])
                  void placeFrame(
                    { x, y },
                    {
                      page: page.ref,
                      frames: page.frames,
                      visible: {
                        x: left,
                        y: top,
                        width: size.width / transform.k,
                        height: size.height / transform.k,
                      },
                    },
                  )
                  return
                }
                const pick = pickAt(layer, withDrawn(frames), { x, y })
                if (pick) notesUi.setState({ open: { kind: 'new', pick } })
                else closeNote()
              }}
              // The gestures select the frame on pointerup and the click follows,
              // so a Cmd-click or a double-click picks inside the frame just selected.
              onClick={(event) => {
                if (event.metaKey) pickInside(event.nativeEvent)
              }}
              // The label strip renames as F2 does, through its gates, and
              // anywhere else a double-click picks inside the frame.
              onDoubleClick={(event) => {
                if (onLabel(event.nativeEvent)) {
                  const rename = findAction('frame.rename')
                  if (rename && isEnabled(rename)) rename.run()
                  return
                }
                pickInside(event.nativeEvent)
              }}
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
        <EmptyState page={page} calls={calls} />
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

/** A new board's guide on its untouched start page, else the empty page notice. */
function EmptyState({ page, calls }: { page: PageRecord; calls: Structure }) {
  return useShowsGuide(page) ? (
    <GuideCard page={page} calls={calls} />
  ) : (
    <EmptyNotice hidden={page.frames} calls={calls} />
  )
}

/**
 * The notice on a page drawing no frame. A page whose frames are all hidden
 * says so, since its layers still list them, and a tab that may write offers
 * to show them. Its body mixes the muted text toward the foreground, since
 * the muted token alone reads 4.3:1 on the light canvas.
 */
function EmptyNotice({
  hidden,
  calls,
}: {
  /** The page's frames, every one hidden when there are any. */
  hidden: readonly FrameRecord[]
  calls: Structure
}) {
  const keysOn = useCharacterKeysOn()
  const canWrite = useLive((state) => state.canWrite)
  if (hidden.length > 0) {
    const counted =
      hidden.length === 1
        ? '1 hidden frame stays'
        : `${hidden.length} hidden frames stay`
    const show = `Show ${hidden.length} frame${hidden.length === 1 ? '' : 's'}`
    return (
      <div
        role="status"
        className="pointer-events-none absolute top-1/2 left-1/2 w-105 max-w-[calc(100%-2rem)] -translate-x-1/2 -translate-y-[55%] text-center text-body leading-[1.6] text-[color-mix(in_srgb,var(--muted-foreground)_85%,var(--foreground))]"
      >
        <div
          aria-hidden
          className="mx-auto mb-3.5 h-12 w-16 rounded-lg border-[1.5px] border-dashed border-faint"
        />
        <p className="mb-1 text-sm font-semibold text-foreground">
          Every frame on this page is hidden
        </p>
        <p>{counted} listed under Layers.</p>
        {canWrite ? (
          <button
            type="button"
            onClick={() =>
              void calls
                .flagFrames(
                  hidden.map((frame) => frame.ref),
                  'hidden',
                  false,
                )
                .catch(reportRefusal("Couldn't show the hidden frames"))
            }
            className="pointer-events-auto mt-3.5 h-[30px] rounded-lg bg-muted px-3 font-medium text-foreground outline-none hover:bg-accent focus-visible:ring-3 focus-visible:ring-ring/50"
          >
            {show}
          </button>
        ) : null}
      </div>
    )
  }
  return (
    <div
      role="status"
      className="pointer-events-none absolute top-1/2 left-1/2 w-105 max-w-[calc(100%-2rem)] -translate-x-1/2 -translate-y-[55%] text-center text-body leading-[1.6] text-[color-mix(in_srgb,var(--muted-foreground)_85%,var(--foreground))]"
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
