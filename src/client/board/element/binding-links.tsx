import { useEffect, useState } from 'react'

import type { ControlBox, DrawnBinding } from '@/shared/frame-bridge/controls'
import { pageBox } from '@/shared/frame-device'
import type { FrameRecord } from '@/shared/records/list'

import { subscribe } from '../bridge/channel'
import { followFrame } from '../bridge/shown'
import { screen } from '../geometry/draw'
import { useMode } from '../mode'
import { useSelection } from '../selection'

/** The gap between a control and its tag under it, and the tag's height, in screen pixels. */
const TAG_GAP = 3
const TAG_HEIGHT = 14

const TAG =
  'absolute origin-top-left rounded-[4px] px-1.5 font-mono text-[9px] leading-[14px] whitespace-nowrap [transform:scale(calc(1/var(--zoom,1)))]'

/**
 * Each selected frame's drawn controls, linked from their targets. A binding
 * matching nothing takes a red tag, the canvas half of `binding-target`.
 */
export function BindingLinks({
  frames,
  container,
}: {
  frames: readonly FrameRecord[]
  container: HTMLElement | null
}) {
  const editing = useMode((state) => state.mode === 'edit')
  const selected = useSelection((state) => state.frames)
  if (!editing) return null
  return frames
    .filter((frame) => selected.includes(frame.ref))
    .map((frame) => (
      <FrameBindings key={frame.ref} frame={frame} container={container} />
    ))
}

function FrameBindings({
  frame,
  container,
}: {
  frame: FrameRecord
  container: HTMLElement | null
}) {
  const bindings = useBindingMeasures(container, frame.ref)
  // A control's box reads in the page, which starts under a phone's status bar.
  const { x, y } = pageBox(frame.box, frame.device, frame.turn)
  return bindings.map((binding) => (
    <div
      key={binding.key}
      data-binding-link
      className="pointer-events-none absolute top-0 left-0"
    >
      <Link binding={binding} at={{ x, y }} />
      <span
        className={`${TAG} ${
          binding.target
            ? 'bg-primary/12 text-primary'
            : 'bg-destructive/14 text-destructive'
        }`}
        style={{
          left: x + binding.control.x,
          top: `calc(${y + binding.control.y + binding.control.height}px + ${screen(TAG_GAP)})`,
        }}
      >
        {binding.label}
      </span>
    </div>
  ))
}

/**
 * The dashed link from a target to its control's tag, none for overlapping
 * boxes, since the tag already sits on the target.
 */
function Link({
  binding: { control, target },
  at,
}: {
  binding: DrawnBinding
  at: { x: number; y: number }
}) {
  if (!target) return null
  const line = `${screen(1.5)} dashed var(--primary)`
  const tagMiddle = `calc(${at.y + control.y + control.height}px + ${screen(TAG_GAP + TAG_HEIGHT / 2)})`
  const right = (box: ControlBox) => box.x + box.width
  if (control.x >= right(target) || right(control) <= target.x) {
    const from = control.x >= right(target) ? right(target) : right(control)
    const to = control.x >= right(target) ? control.x : target.x
    return (
      <span
        className="absolute"
        style={{
          left: at.x + from,
          top: tagMiddle,
          width: to - from,
          borderTop: line,
        }}
      />
    )
  }
  const bottom = target.y + target.height
  if (control.y < bottom) return null
  return (
    <span
      className="absolute"
      style={{
        left: at.x + control.x,
        top: at.y + bottom,
        height: control.y - bottom,
        borderLeft: line,
      }}
    />
  )
}

/**
 * The frame's controls and their targets, which its page measures and pushes
 * again on a resize or scroll, read anew on each page, restamp, and swap.
 * Empty while no live iframe shows it.
 */
function useBindingMeasures(
  container: HTMLElement | null,
  ref: string,
): DrawnBinding[] {
  const [bindings, setBindings] = useState<DrawnBinding[]>([])
  useEffect(() => {
    if (!container) return
    return followFrame(
      container,
      ref,
      (iframe) => {
        const measured = subscribe(iframe, 'bindings', {}, setBindings)
        // A refusal draws nothing, since a page being replaced can hold no root.
        void measured.opened.then((first) => setBindings(first ?? []))
        return measured.close
      },
      () => setBindings([]),
    )
  }, [container, ref])
  return bindings
}
