import {
  type PointerEvent as ReactPointerEvent,
  useEffect,
  useRef,
} from 'react'
import { createPortal } from 'react-dom'
import { useStore } from 'zustand'

import type { ModelReading, ModelStage } from '@/shared/frame-bridge/model'

import type { Box } from '../geometry/box'
import { screen } from '../geometry/draw'
import { useMode } from '../mode'
import { type ElementKey, useSelection } from '../selection'
import {
  type LiveModel,
  stageAndWrite,
  useLiveModel,
  writeStaged,
} from './model'
import { type Angle, angleOf, orbitStages } from './model-staging'
import { isTurning, stopTurn, turnedBy, turnStore } from './turn'

/** A drag in progress, read off the viewer as the press found it. */
interface Drag {
  from: ModelReading
  /** The angle last shown, null until the pointer moves the model. */
  shown: Angle | null
  /** Stops following the pointer. */
  stop: () => void
}

interface TurnSurfaceProps {
  element: ElementKey | null
  /** The element's box in board pixels. */
  box: Box
  /** Its frame's box in board pixels, which the chip sits under. */
  frame: Box
  container: HTMLElement | null
  /** Writes a released turn, `writeStaged` unless a test answers for the board. */
  write?: typeof writeStaged
}

/**
 * Turn mode's drag surface and chip, in the notes layer, since a press on the
 * frames' layer moves the element. A release writes the orbit and its reach
 * as one undo step, and Escape mid-drag puts back the angle the file holds.
 */
export function TurnSurface({
  element,
  box,
  frame,
  container,
  write = writeStaged,
}: TurnSurfaceProps) {
  const editing = useMode((state) => state.mode === 'edit')
  const page = useSelection((state) => state.page)
  const on = useStore(
    turnStore,
    ({ turning }) => editing && isTurning(turning, element),
  )
  const model = useLiveModel(on ? element : null)
  const surface = useRef<HTMLDivElement>(null)
  const drag = useRef<Drag | null>(null)
  // The latest reading's act, which a drag outliving its render still reaches.
  const stage = useRef<LiveModel['stage'] | undefined>(undefined)
  useEffect(() => {
    stage.current = model?.stage
  })

  const frameRef = element?.frame
  const index = element?.index
  useEffect(() => {
    if (!on) return
    const key = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') return
      // The board's own Escape would clear the selection the mode sits on.
      event.preventDefault()
      event.stopPropagation()
      stopTurn()
    }
    const press = (event: PointerEvent) => {
      const inside =
        event.target instanceof Node && surface.current?.contains(event.target)
      if (!inside) stopTurn()
    }
    window.addEventListener('keydown', key, true)
    window.addEventListener('pointerdown', press, true)
    return () => {
      window.removeEventListener('keydown', key, true)
      window.removeEventListener('pointerdown', press, true)
      putBack(drag, stage)
    }
  }, [on, frameRef, index])

  const layer = container?.parentElement?.querySelector(
    ':scope > [data-notes-layer]',
  )
  // Nothing draws until the viewer is read, so a press never lands on a surface that cannot turn it.
  if (!on || !layer || !element || !page || !model) return null

  const begin = (event: ReactPointerEvent<HTMLDivElement>) => {
    if (event.button !== 0 || drag.current) return
    const from = model.reading
    const start = { x: event.clientX, y: event.clientY }
    const show = (changes: readonly ModelStage[]) => stage.current?.(changes)
    const move = (moved: PointerEvent) => {
      const held = drag.current
      if (!held) return
      const angle = turnedBy(angleOf(from), {
        dx: moved.clientX - start.x,
        dy: moved.clientY - start.y,
      })
      const last = held.shown ?? angleOf(from)
      if (angle.theta === last.theta && angle.phi === last.phi) return
      held.shown = angle
      show(orbitStages(from.staged, angle))
    }
    const release = () => {
      const held = drag.current
      drag.current = null
      held?.stop()
      if (!held?.shown) return
      void stageAndWrite(
        { reading: from, stage: show },
        orbitStages(from.staged, held.shown),
        (changes) => write(page, element, changes),
        from.staged,
      )
    }
    const cancel = () => putBack(drag, stage)
    // On the window as a rail's drag is, so the turn follows a pointer past the model's box.
    window.addEventListener('pointermove', move)
    window.addEventListener('pointerup', release)
    window.addEventListener('pointercancel', cancel)
    drag.current = {
      from,
      shown: null,
      stop: () => {
        window.removeEventListener('pointermove', move)
        window.removeEventListener('pointerup', release)
        window.removeEventListener('pointercancel', cancel)
      },
    }
  }

  return createPortal(
    <>
      <div
        ref={surface}
        data-turn-surface
        className="pointer-events-auto absolute cursor-grab touch-none active:cursor-grabbing"
        style={{
          left: box.x,
          top: box.y,
          width: box.width,
          height: box.height,
        }}
        onPointerDown={begin}
      />
      <span
        role="status"
        className="absolute origin-top-left rounded-[4px] bg-primary-fill px-[7px] py-0.5 text-[10px] leading-[14px] font-medium whitespace-nowrap text-primary-foreground [transform:scale(calc(1/var(--zoom,1)))]"
        style={{
          left: frame.x,
          top: `calc(${frame.y + frame.height}px + ${screen(6)})`,
        }}
      >
        Turning, Esc to leave
      </span>
    </>,
    layer,
  )
}

/** Ends a drag with nothing written, the live viewer back at the angle the file holds. */
function putBack(
  drag: { current: Drag | null },
  stage: { current: LiveModel['stage'] | undefined },
): void {
  const held = drag.current
  drag.current = null
  held?.stop()
  if (!held?.shown) return
  stage.current?.(
    orbitStages(held.from.staged, held.shown).map(({ name }) => ({
      name,
      value: held.from.staged[name],
    })),
  )
}
