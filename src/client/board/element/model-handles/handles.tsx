import {
  type PointerEvent as ReactPointerEvent,
  useEffect,
  useRef,
  useState,
  useSyncExternalStore,
} from 'react'
import { createPortal } from 'react-dom'
import { useStore } from 'zustand'

import { cn } from '@/client/lib/cn'
import { useLive } from '@/client/live/store'
import { useFrameTheme } from '@/client/theme/store'
import type { Offsets, ResizeRead } from '@/shared/frame-bridge/live-element'
import type { ModelReading, ModelTransform } from '@/shared/frame-bridge/model'

import type { Box } from '../../geometry/box'
import { screen } from '../../geometry/draw'
import { HANDLE_REACH } from '../../geometry/hit'
import { useMode } from '../../mode'
import { usePreview } from '../../preview/store'
import { type ElementKey, useSelection } from '../../selection'
import { canvasView } from '../../view'
import { heldOutline, holdOutline } from '../held'
import {
  holdAndWrite,
  type LiveModel,
  stageAndWrite,
  unpreview,
  useLiveModel,
  writeStaged,
} from '../model'
import {
  depthOf,
  scaledTo,
  scaleOf,
  transformOf,
  turnOf,
  turnStage,
} from '../model-staging'
import { startPlacedMove } from '../resize'
import { isTurning, turnStore } from '../turn'
import {
  type Axis,
  depthOfDrag,
  HANDLE,
  type Handle,
  handlesFit,
  handlesOf,
  sizeOfDrag,
  TIP_REACH,
  turnOfDrag,
  type Vector,
} from './axes'
import { type HandleMode, handlesStore, isLinked, setHandleMode } from './store'

const MODES: readonly { mode: HandleMode; label: string }[] = [
  { mode: 'move', label: 'Move' },
  { mode: 'turn', label: 'Turn' },
  { mode: 'size', label: 'Size' },
]

/** How far a press on the canvas travels before it drags something the gizmo leaves for. */
const DRAG_SLOP = 3

/** What a held handle does with each move of the pointer, its release, and its cancel. */
interface Act {
  move: (drag: Vector) => void
  release: () => void
  cancel: () => void
}

interface Drag {
  axis: Axis
  act: Act
  /** Stops following the pointer. */
  stop: () => void
}

/** The writes a handle's release sends, the board's own unless a test answers for it. */
export interface HandleWrites {
  staged: typeof writeStaged
  placed: typeof startPlacedMove
}

const WRITES: HandleWrites = { staged: writeStaged, placed: startPlacedMove }

interface ModelHandlesProps {
  element: ElementKey | null
  /** The element's box in board pixels. */
  box: Box
  /** Its `left` and `top` while it is placed, null in the flow. */
  placed: Offsets | null
  /** How it takes a corner resize, which its held outline keeps after a drop. */
  read: ResizeRead | null
  locked: boolean
  container: HTMLElement | null
  writes?: HandleWrites
}

/**
 * A selected model's X, Y, and Z handles under their mode switch, in the
 * notes layer. They take no focus, since each Transform field does the same
 * by keyboard.
 */
export function ModelHandles(props: ModelHandlesProps) {
  const { element, box, locked } = props
  const editing = useMode(
    ({ mode, tool, spacePan }) =>
      mode === 'edit' && tool === 'move' && !spacePan,
  )
  const canWrite = useLive((state) => state.canWrite)
  const turning = useStore(turnStore, (state) =>
    isTurning(state.turning, element),
  )
  const { width, height } = box
  const fits = useSyncExternalStore(canvasView.onZoom, () => {
    const zoom = canvasView.zoom()
    return handlesFit(
      { width: width * zoom, height: height * zoom },
      HANDLE_REACH,
    )
  })
  const on = editing && canWrite && !turning && !locked && fits
  const model = useLiveModel(on ? element : null)
  const layer = props.container?.parentElement?.querySelector(
    ':scope > [data-notes-layer]',
  )
  if (!on || !element || !layer || !model?.reading.camera) return null
  return createPortal(
    <Gizmo
      key={`${element.frame}\n${element.index}`}
      {...props}
      element={element}
      model={model}
    />,
    layer,
  )
}

/** Hides the gizmo while a press on the canvas beside it drags the model or a corner. */
function useDraggedElsewhere(gizmo: { current: HTMLElement | null }): boolean {
  const [dragged, setDragged] = useState(false)
  useEffect(() => {
    let from: Vector | null = null
    const press = (event: PointerEvent) => {
      const target = event.target instanceof Element ? event.target : null
      const beside =
        target?.closest('[data-canvas]') && !gizmo.current?.contains(target)
      from = beside ? { x: event.clientX, y: event.clientY } : null
    }
    const move = (event: PointerEvent) => {
      if (!from) return
      const gone = Math.hypot(event.clientX - from.x, event.clientY - from.y)
      if (gone > DRAG_SLOP) setDragged(true)
    }
    const end = () => {
      from = null
      setDragged(false)
    }
    window.addEventListener('pointerdown', press, true)
    window.addEventListener('pointermove', move)
    window.addEventListener('pointerup', end)
    window.addEventListener('pointercancel', end)
    return () => {
      window.removeEventListener('pointerdown', press, true)
      window.removeEventListener('pointermove', move)
      window.removeEventListener('pointerup', end)
      window.removeEventListener('pointercancel', end)
    }
  }, [gizmo])
  return dragged
}

interface GizmoProps extends ModelHandlesProps {
  element: ElementKey
  model: LiveModel
}

function Gizmo({
  element,
  box,
  placed,
  read,
  container,
  model,
  writes = WRITES,
}: GizmoProps) {
  const page = useSelection((state) => state.page)
  const mode = useStore(handlesStore, (state) => state.mode)
  const theme = useFrameTheme(element.frame)
  const previewed = usePreview(element.frame)?.width
  const gizmo = useRef<HTMLDivElement>(null)
  const drag = useRef<Drag | null>(null)
  const [held, setHeld] = useState<Axis | null>(null)
  const [shift, setShift] = useState<Vector>({ x: 0, y: 0 })
  const elsewhere = useDraggedElsewhere(gizmo)
  // The latest reading's acts, which a drag outliving its render still reaches.
  const latest = useRef(model)
  useEffect(() => {
    latest.current = model
  })

  const end = () => {
    const ended = drag.current
    drag.current = null
    ended?.stop()
    setHeld(null)
    return ended
  }
  const abandon = () => end()?.act.cancel()
  // A drag shows the page it began on, which a theme, a width, or another element's bytes replace.
  const abandonRef = useRef(abandon)
  useEffect(() => {
    abandonRef.current = abandon
  })
  useEffect(
    () => () => abandonRef.current(),
    [theme, previewed, element.hash, mode],
  )

  const shiftOutline = (by: Vector | null) => {
    setShift(by ?? { x: 0, y: 0 })
    const outline = container?.parentElement?.querySelector<HTMLElement>(
      '[data-element-selection]',
    )
    if (!outline) return
    outline.style.transform = by ? `translate(${by.x}px, ${by.y}px)` : ''
  }

  /** Moves a placed model on the page along one of its sides. */
  const moving = (axis: 'x' | 'y', from: Offsets, page: string): Act | null => {
    const move = writes.placed(page, element)
    if (!move) return null
    let by: Vector = { x: 0, y: 0 }
    const to = () => ({ left: from.left + by.x, top: from.top + by.y })
    const putBack = () => {
      move.cancel()
      shiftOutline(null)
    }
    return {
      move: ({ x, y }) => {
        const pixels = Math.round((axis === 'x' ? x : y) / canvasView.zoom())
        by = axis === 'x' ? { x: pixels, y: 0 } : { x: 0, y: pixels }
        move.preview(to())
        shiftOutline(by)
      },
      release: () => {
        if (by.x === 0 && by.y === 0) return putBack()
        const dropped = { ...box, x: box.x + by.x, y: box.y + by.y }
        shiftOutline(null)
        // Held until the page measures the model again, since a move resizes nothing.
        holdOutline({ key: element, box: dropped, read })
        void move.commit(to()).then((landed) => {
          if (!landed && heldOutline()?.key === element) holdOutline(null)
        })
      },
      cancel: putBack,
    }
  }

  /** Sizes the model or moves it in its scene, both of which hold the camera. */
  const holding = (
    from: ModelReading,
    page: string,
    to: (drag: Vector) => ModelTransform,
  ): Act => {
    let shown: ModelTransform | null = null
    return {
      move: (by) => {
        shown = to(by)
        latest.current.preview(shown)
      },
      release: () => {
        if (!shown) return
        const same = JSON.stringify(shown) === JSON.stringify(transformOf(from))
        if (same) return unpreview(latest.current, from)
        void holdAndWrite(
          latest.current,
          shown,
          (changes) => writes.staged(page, element, changes),
          from,
        )
      },
      cancel: () => {
        if (shown) unpreview(latest.current, from)
      },
    }
  }

  /** Turns the model about one of its own axes. */
  const turningBy = (from: ModelReading, page: string, handle: Handle): Act => {
    const turn = turnOf(from.staged.orientation)
    let degrees = 0
    const { axis } = handle
    const stages = () => [turnStage({ ...turn, [axis]: turn[axis] + degrees })]
    const putBack = () =>
      latest.current.stage([
        { name: 'orientation', value: from.staged.orientation },
      ])
    return {
      move: (by) => {
        const next = turnOfDrag(handle, by)
        if (next === degrees) return
        degrees = next
        latest.current.stage(stages())
      },
      release: () => {
        if (degrees === 0) return putBack()
        void stageAndWrite(
          { reading: from, stage: (changes) => latest.current.stage(changes) },
          stages(),
          (changes) => writes.staged(page, element, changes),
          from.staged,
        )
      },
      cancel: putBack,
    }
  }

  const actOf = (handle: Handle): Act | null => {
    const from = model.reading
    const { axis } = handle
    const { links } = handlesStore.getState()
    if (!page || !from.camera) return null
    if (mode === 'turn') return turningBy(from, page, handle)
    if (mode === 'size') {
      const scale = scaleOf(from.staged.scale)
      const linked = isLinked(links, element, scale)
      return holding(from, page, (by) => {
        const size = scale[axis] * sizeOfDrag(handle, by)
        return {
          ...transformOf(from),
          scale: scaledTo(scale, axis, Number(size.toFixed(2)), linked),
        }
      })
    }
    if (axis !== 'z') return placed ? moving(axis, placed, page) : null
    const { camera } = from
    const height = box.height * canvasView.zoom()
    return holding(from, page, (by) => ({
      ...transformOf(from),
      depth: (depthOf(from) ?? 0) + depthOfDrag(handle, by, camera, height),
    }))
  }

  const begin = (handle: Handle) => (event: ReactPointerEvent) => {
    if (event.button !== 0 || drag.current) return
    const act = actOf(handle)
    if (!act) return
    const start = { x: event.clientX, y: event.clientY }
    let moved = false
    const move = (to: PointerEvent) => {
      const by = { x: to.clientX - start.x, y: to.clientY - start.y }
      if (!moved && by.x === 0 && by.y === 0) return
      moved = true
      act.move(by)
    }
    const release = () => {
      const ended = end()
      if (moved) ended?.act.release()
      else ended?.act.cancel()
    }
    const cancel = () => end()?.act.cancel()
    const key = (pressed: KeyboardEvent) => {
      if (pressed.key !== 'Escape') return
      // The board's own Escape would clear the selection the gizmo sits on.
      pressed.preventDefault()
      pressed.stopPropagation()
      cancel()
    }
    // On the window, so the drag follows a pointer past the model's frame.
    window.addEventListener('pointermove', move)
    window.addEventListener('pointerup', release)
    window.addEventListener('pointercancel', cancel)
    window.addEventListener('keydown', key, true)
    drag.current = {
      axis: handle.axis,
      act,
      stop: () => {
        window.removeEventListener('pointermove', move)
        window.removeEventListener('pointerup', release)
        window.removeEventListener('pointercancel', cancel)
        window.removeEventListener('keydown', key, true)
      },
    }
    setHeld(handle.axis)
  }

  const handles = handlesOf(mode, model.reading, placed !== null)
  return (
    <div
      ref={gizmo}
      data-model-handles={mode}
      hidden={elsewhere}
      className="absolute"
      style={{
        left: box.x + shift.x,
        top: box.y + shift.y,
        width: box.width,
        height: box.height,
      }}
    >
      <div
        className="absolute bottom-full left-1/2"
        // Past the Y handle, where one reaches over a short model's top edge.
        style={{
          marginBottom: `max(${screen(10)}, calc(${screen(HANDLE + 24)} - ${box.height / 2}px))`,
        }}
      >
        <div
          role="group"
          aria-label="Model handles"
          data-label-control
          className="pointer-events-auto flex origin-bottom-left gap-0.5 rounded-[7px] bg-card p-0.5 shadow-[0_0_0_1px_var(--border)] [transform:scale(calc(1/var(--zoom,1)))_translateX(-50%)]"
        >
          {MODES.map(({ mode: each, label }) => (
            <button
              key={each}
              type="button"
              aria-pressed={each === mode}
              onClick={() => setHandleMode(each)}
              className={cn(
                'h-6 rounded-[5px] px-2 text-[10px] text-muted-foreground outline-none hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring',
                each === mode && 'bg-accent font-semibold text-foreground',
              )}
            >
              {label}
            </button>
          ))}
        </div>
      </div>
      <svg
        aria-hidden
        className="absolute top-1/2 left-1/2 size-px origin-top-left overflow-visible [transform:scale(calc(1/var(--zoom,1)))]"
      >
        {handles.map((handle) => (
          <HandleMark
            key={handle.axis}
            handle={handle}
            mode={mode}
            held={held === handle.axis}
            onPointerDown={begin(handle)}
          />
        ))}
      </svg>
    </div>
  )
}

/** The cursor a drag along a direction takes, the nearest of the four a browser draws. */
function cursorAlong({ x, y }: Vector): string {
  const turn = (Math.atan2(y, x) * 180) / Math.PI
  const eighth = ((Math.round(turn / 45) % 4) + 4) % 4
  return (
    ['ew-resize', 'nwse-resize', 'ns-resize', 'nesw-resize'][eighth] ??
    'ew-resize'
  )
}

interface HandleMarkProps {
  handle: Handle
  mode: HandleMode
  held: boolean
  onPointerDown: (event: ReactPointerEvent) => void
}

/**
 * One handle: a line in the selection's blue over a white edge, so it reads on
 * any fill, a cap that names its mode, and its axis's letter, since no axis has
 * a color of its own.
 */
function HandleMark({ handle, mode, held, onPointerDown }: HandleMarkProps) {
  const { axis, tip, turning } = handle
  const length = Math.hypot(tip.x, tip.y)
  const along = { x: tip.x / length, y: tip.y / length }
  const angle = (Math.atan2(tip.y, tip.x) * 180) / Math.PI
  const letter = { x: tip.x + along.x * 15, y: tip.y + along.y * 15 }
  const start = { x: along.x * TIP_REACH, y: along.y * TIP_REACH }
  const weight = held ? 3 : 2
  return (
    <g
      data-model-handle={axis}
      className="pointer-events-auto touch-none"
      style={{ cursor: cursorAlong(mode === 'turn' ? turning : along) }}
      onPointerDown={onPointerDown}
    >
      <line
        x2={tip.x}
        y2={tip.y}
        className="stroke-white"
        strokeWidth={weight + 2}
        strokeLinecap="round"
      />
      <line
        x2={tip.x}
        y2={tip.y}
        className="stroke-primary"
        strokeWidth={weight}
        strokeLinecap="round"
      />
      <g
        transform={`translate(${tip.x} ${tip.y}) rotate(${angle})`}
        className="fill-primary stroke-white"
        strokeWidth={1.5}
      >
        {mode === 'move' ? <path d="M-5 -5.5 7 0 -5 5.5Z" /> : null}
        {mode === 'turn' ? <circle r={5.5} /> : null}
        {mode === 'size' ? (
          <rect x={-5} y={-5} width={10} height={10} rx={1} />
        ) : null}
      </g>
      <text
        x={letter.x}
        y={letter.y}
        textAnchor="middle"
        dominantBaseline="central"
        className="fill-primary-fill stroke-white text-[10px] font-semibold [paint-order:stroke] select-none"
        strokeWidth={3}
        strokeLinejoin="round"
      >
        {axis.toUpperCase()}
      </text>
      <line
        x1={start.x}
        y1={start.y}
        x2={tip.x}
        y2={tip.y}
        stroke="transparent"
        strokeWidth={12}
        pointerEvents="stroke"
      />
      <circle
        cx={tip.x}
        cy={tip.y}
        r={TIP_REACH}
        fill="transparent"
        data-model-handle-tip
      />
    </g>
  )
}
