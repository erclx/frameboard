import { pointer } from 'd3-selection'
import { zoomTransform } from 'd3-zoom'
import { type RefObject, useEffect } from 'react'

import type { FrameRecord } from '@/shared/records/list'

import { frameAt } from '../geometry/hit'
import { enteredStore, enterFrame, leaveFrame } from './entered'

interface PlayShieldProps {
  /** The canvas viewport, whose zoom transform turns a press into a board point. */
  viewport: RefObject<HTMLDivElement | null>
  /** The page's shown frames where they draw, read at each click. */
  frames: () => readonly FrameRecord[]
  /** The page, so a switch leaves the frame entered on the last one. */
  page: string
  /** The frames drawing a live page, null until the view first settles. */
  live: ReadonlySet<string> | null
}

/**
 * The layer under the frames in Play. The frames' layer passes the pointer
 * through to it everywhere but the entered frame, so the wheel, a pinch, and
 * a drag reach the board's zoom over any other frame. A click enters the
 * frame under it and a click on empty canvas leaves. d3-zoom swallows the
 * click ending a drag, so a pan starting over a frame never enters it.
 */
export function PlayShield({ viewport, frames, page, live }: PlayShieldProps) {
  useEffect(() => leaveFrame, [page])

  // A culled frame draws a placeholder, which takes no input, and a hidden
  // or deleted one draws nothing.
  useEffect(() => {
    if (!live) return
    const ref = enteredStore.getState().ref
    if (ref !== null && !live.has(ref)) leaveFrame()
  }, [live])

  return (
    <div
      data-play-shield
      className="absolute inset-0"
      onClick={(event) => {
        const element = viewport.current
        if (!element) return
        const transform = zoomTransform(element)
        const [x, y] = transform.invert(pointer(event.nativeEvent, element))
        const frame = frameAt(frames(), { x, y }, transform.k)
        if (frame) enterFrame(frame.ref)
        else leaveFrame()
      }}
    />
  )
}
