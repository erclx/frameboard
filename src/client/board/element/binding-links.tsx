import { useEffect, useState } from 'react'

import {
  BINDS_ATTRIBUTE,
  isCustomProperty,
  parseBinds,
} from '@/shared/bindings'
import { pageBox } from '@/shared/frame-device'
import type { FrameRecord } from '@/shared/records/list'

import { RESTAMPED } from '../frame-dom'
import type { Box } from '../geometry/box'
import { screen } from '../geometry/draw'
import { useMode } from '../mode'
import { useSelection } from '../selection'

/** One control's binding as the canvas draws it, in its frame's own pixels. */
export interface DrawnBinding {
  /** Keys the drawn row, being the control's position among the frame's controls. */
  key: number
  control: Box
  /** The element it tunes, null when its selector matches nothing. */
  target: Box | null
  label: string
}

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
  const right = (box: Box) => box.x + box.width
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
 * The frame's controls and their targets, measured again whenever the frame
 * loads, resizes, or its page scrolls. Empty while no live iframe shows it.
 */
function useBindingMeasures(
  container: HTMLElement | null,
  ref: string,
): DrawnBinding[] {
  const [bindings, setBindings] = useState<DrawnBinding[]>([])
  useEffect(() => {
    if (!container) return
    let stopWatching = () => {}
    const measure = () => {
      stopWatching()
      const doc = container.querySelector<HTMLIFrameElement>(
        `[data-frame="${CSS.escape(ref)}"] iframe`,
      )?.contentDocument
      const view = doc?.defaultView
      // A restamp can reach a page being replaced, which holds no root yet.
      const root = doc?.documentElement
      if (!doc || !view || !root) {
        setBindings([])
        return
      }
      const read = () => setBindings(readBindings(doc))
      read()
      const observer = new view.ResizeObserver(read)
      observer.observe(root)
      view.addEventListener('scroll', read, true)
      stopWatching = () => {
        observer.disconnect()
        view.removeEventListener('scroll', read, true)
      }
    }
    measure()
    // Captured, since neither a load nor a restamp bubbles.
    container.addEventListener('load', measure, true)
    container.addEventListener(RESTAMPED, measure, true)
    return () => {
      container.removeEventListener('load', measure, true)
      container.removeEventListener(RESTAMPED, measure, true)
      stopWatching()
    }
  }, [container, ref])
  return bindings
}

/** Every control in `doc` with the box it and its target draw at. */
function readBindings(doc: Document): DrawnBinding[] {
  return [...doc.querySelectorAll(`[${BINDS_ATTRIBUTE}]`)].map(
    (control, key) => {
      const value = control.getAttribute(BINDS_ATTRIBUTE) ?? ''
      const binding = parseBinds(value)
      const target =
        binding && isCustomProperty(binding.property)
          ? matchOf(doc, binding.selector)
          : null
      const label = !binding
        ? `${value.trim() || BINDS_ATTRIBUTE}, no property`
        : !isCustomProperty(binding.property)
          ? `${binding.property}, not a custom property`
          : target
            ? `${binding.selector} ${binding.property}`
            : `${binding.selector}, no match`
      return {
        key,
        control: boxOf(control),
        target: target ? boxOf(target) : null,
        label,
      }
    },
  )
}

function matchOf(doc: Document, selector: string): Element | null {
  try {
    return doc.querySelector(selector)
  } catch {
    return null
  }
}

function boxOf(element: Element): Box {
  const rect = element.getBoundingClientRect()
  return {
    x: Math.round(rect.left),
    y: Math.round(rect.top),
    width: Math.round(rect.width),
    height: Math.round(rect.height),
  }
}
