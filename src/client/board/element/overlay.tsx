import { useEffect, useState } from 'react'

import type { FrameRecord } from '@/shared/records/list'

import { elementAt, renderedHash } from '../frame-dom'
import type { Box } from '../geometry/box'
import { OUTLINE, screen, sizeLabel } from '../geometry/draw'
import { CHIP, OVERLAY_Z } from '../geometry/overlay'
import { usePendingBox } from '../geometry/write'
import { type ElementKey, useSelection } from '../selection'

const CORNERS = [
  { left: 0, top: 0 },
  { left: '100%', top: 0 },
  { left: 0, top: '100%' },
  { left: '100%', top: '100%' },
] as const

interface ElementOverlayProps {
  /** The page's shown frames, which the selected element's frame is found among. */
  frames: readonly FrameRecord[]
  /** The canvas layer holding the frames' iframes. */
  container: HTMLElement | null
}

/**
 * The selected element's outline, its four corner marks, and its size chip,
 * at a constant screen size through `--zoom` as the frame selection draws
 * them. It is placed from the live element's box inside the frame's iframe
 * and follows that element as it resizes, so it draws nothing while the
 * frame is a placeholder or shows other bytes than the selection names. The
 * marks take no pointer events, since the gestures find a press on one by
 * where it draws, and a shape's corner drag resizes it there.
 */
export function ElementOverlay({ frames, container }: ElementOverlayProps) {
  const element = useSelection((state) => state.element ?? null)
  const frame = frames.find((candidate) => candidate.ref === element?.frame)
  const pending = usePendingBox(frame?.ref ?? '')
  const rect = useElementBox(container, element)
  const at = pending ?? frame?.box
  if (!at || !rect) return null
  return (
    <div
      data-element-selection
      className="pointer-events-none absolute"
      style={{
        left: at.x + rect.x,
        top: at.y + rect.y,
        width: rect.width,
        height: rect.height,
        outline: OUTLINE,
        outlineOffset: screen(2),
        zIndex: OVERLAY_Z,
      }}
    >
      {CORNERS.map((corner) => (
        <span
          key={`${corner.left}-${corner.top}`}
          data-element-corner
          className="absolute -translate-1/2 border-primary bg-white"
          style={{
            ...corner,
            width: screen(7),
            height: screen(7),
            borderWidth: screen(1.5),
          }}
        />
      ))}
      <span data-chip className={CHIP}>
        {sizeLabel(rect)}
      </span>
    </div>
  )
}

/**
 * The element's box inside its frame, in the frame's own pixels, measured
 * again whenever the frame loads, the element resizes, or the frame's page
 * scrolls. Null while no live iframe shows the bytes the key was read from.
 */
function useElementBox(
  container: HTMLElement | null,
  element: ElementKey | null,
): Box | null {
  // Held with the key it was measured for, so one element's box never draws on the next.
  const [measured, setMeasured] = useState<{
    key: string
    box: Box | null
  } | null>(null)
  const frame = element?.frame
  const index = element?.index
  const hash = element?.hash
  const key = element ? `${frame}:${index}:${hash}` : null
  useEffect(() => {
    if (!container || key === null) return
    if (frame === undefined || index === undefined) return
    const setBox = (box: Box | null) => setMeasured({ key, box })
    let stopWatching = () => {}
    const measure = () => {
      stopWatching()
      const document = container.querySelector<HTMLIFrameElement>(
        `[data-frame="${CSS.escape(frame)}"] iframe`,
      )?.contentDocument
      const target =
        document && renderedHash(document) === hash
          ? elementAt(document, index)
          : null
      const view = document?.defaultView
      if (!target || !view) {
        setBox(null)
        return
      }
      const read = () => {
        const rect = target.getBoundingClientRect()
        setBox({
          x: Math.round(rect.left),
          y: Math.round(rect.top),
          width: Math.round(rect.width),
          height: Math.round(rect.height),
        })
      }
      read()
      // An observer from the frame's own window, since the element lives there.
      const observer = new view.ResizeObserver(read)
      observer.observe(target)
      observer.observe(target.ownerDocument.documentElement)
      view.addEventListener('scroll', read, true)
      stopWatching = () => {
        observer.disconnect()
        view.removeEventListener('scroll', read, true)
      }
    }
    measure()
    // A load does not bubble, so a frame mounting or reloading is caught on the way down.
    container.addEventListener('load', measure, true)
    return () => {
      container.removeEventListener('load', measure, true)
      stopWatching()
    }
  }, [container, key, frame, index, hash])
  return measured?.key === key ? measured.box : null
}
