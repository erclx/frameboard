import { useEffect } from 'react'
import { createPortal } from 'react-dom'
import { useStore } from 'zustand'

import { pageBox, turnsWith } from '@/shared/frame-device'
import type { FrameRecord } from '@/shared/records/list'

import { subscribe } from '../bridge/channel'
import { followFrame } from '../bridge/shown'
import type { Box } from '../geometry/box'
import { OUTLINE, screen, sizeLabel } from '../geometry/draw'
import { CHIP, OVERLAY_Z } from '../geometry/overlay'
import { usePendingBox, usePendingFrames } from '../geometry/write'
import { useMode } from '../mode'
import { type ElementKey, useSelection } from '../selection'
import { groupBounds, type GroupMember, scalesAsGroup } from './group'
import { heldStore, holdOutline } from './held'
import { useGhosts, useMeasures } from './measures'
import { useLiveMedia } from './media'
import { MediaBar } from './media-bar'
import { TurnSurface } from './turn-surface'

const CORNERS = [
  { left: 0, top: 0 },
  { left: '100%', top: 0 },
  { left: 0, top: '100%' },
  { left: '100%', top: '100%' },
] as const

/** A member's outline inside a group's box, thinner so the group reads as one. */
const MEMBER_OUTLINE = `${screen(1)} solid var(--primary)`

/** An element past its frame's edge, its box in the frame's own pixels. */
interface Ghost {
  key: ElementKey
  box: Box
}

interface ElementOverlayProps {
  /** The page's shown frames, which the selected element's frame is found among. */
  frames: readonly FrameRecord[]
  /** The canvas layer holding the frames' iframes. */
  container: HTMLElement | null
}

/**
 * The selected element's outline, chip, and corner marks over the overflow
 * ghosts, drawn from the live box and nothing while the frame shows other
 * bytes. The marks take no pointer, since the gestures find them by position.
 */
export function ElementOverlay({ frames, container }: ElementOverlayProps) {
  return (
    <>
      <ElementGhosts frames={frames} container={container} />
      <ElementOutlines frames={frames} container={container} />
    </>
  )
}

/**
 * A dashed box over each element past its frame's edge, where the iframe
 * cannot paint it, drawn under the Move tool alone, where a press takes it.
 */
function ElementGhosts({ frames, container }: ElementOverlayProps) {
  const selected = useSelection((state) => state.frames)
  const moving = useMode(
    (state) => state.mode === 'edit' && state.tool === 'move',
  )
  const drawn = usePendingFrames(frames)
  // A scroll frame reaches its overflow by scrolling, and a shown phone, tablet, or foldable is one screen of a page that scrolls, as Present and Play scroll it, so neither draws a ghost.
  const walked = moving
    ? selected.filter(
        (ref) =>
          !frames.some(
            (frame) =>
              frame.ref === ref && (frame.scroll || turnsWith(frame.device)),
          ),
      )
    : []
  const held = useGhosts(container, walked)
  const ghosts = walked.flatMap((ref): Ghost[] => {
    const overflow = held.get(ref)
    return overflow
      ? overflow.ghosts.map(({ index, box }) => ({
          key: { frame: ref, index, hash: overflow.hash },
          box,
        }))
      : []
  })
  return ghosts.map(({ key, box }) => {
    const frame = drawn.find(({ ref }) => ref === key.frame)
    if (!frame) return null
    const page = pageBox(frame.box, frame.device, frame.turn)
    return (
      <div
        key={`${key.frame}:${key.index}`}
        data-element-ghost
        data-ghost-frame={key.frame}
        data-ghost-index={key.index}
        data-ghost-hash={key.hash}
        className="pointer-events-none absolute bg-primary/28"
        style={{
          left: page.x + box.x,
          top: page.y + box.y,
          width: box.width,
          height: box.height,
          outline: `${screen(1.5)} dashed var(--primary)`,
          outlineOffset: screen(2),
          clipPath: outsideOf(box, page),
          zIndex: OVERLAY_Z,
        }}
      />
    )
  })
}

/**
 * A clip showing an element's box and its outline only past its frame's
 * edge: a ring wider than the outline reaches, less the frame's viewport in
 * the element's own coordinates, cut out by the even-odd rule.
 */
function outsideOf(box: Box, frame: Box): string {
  const pad = screen(8)
  const near = `calc(0px - ${pad})`
  const far = `calc(100% + ${pad})`
  const x0 = `${-box.x}px`
  const y0 = `${-box.y}px`
  const x1 = `${frame.width - box.x}px`
  const y1 = `${frame.height - box.y}px`
  return `polygon(evenodd, ${near} ${near}, ${far} ${near}, ${far} ${far}, ${near} ${far}, ${near} ${near}, ${x0} ${y0}, ${x0} ${y1}, ${x1} ${y1}, ${x1} ${y0}, ${x0} ${y0})`
}

/** The selected element's outline, or several's group box around their outlines. */
function ElementOutlines({ frames, container }: ElementOverlayProps) {
  const element = useSelection((state) => state.element ?? null)
  const members = useSelection((state) => state.elements)
  const several = (members?.length ?? 0) > 1 ? members : undefined
  if (several) {
    return (
      <GroupOutline elements={several} frames={frames} container={container} />
    )
  }
  return (
    <ElementOutline element={element} frames={frames} container={container} />
  )
}

interface GroupOutlineProps extends ElementOverlayProps {
  elements: readonly ElementKey[]
}

/**
 * One box around several elements, with corner marks only while every member
 * is free, since only then does a corner drag scale them.
 */
function GroupOutline({ elements, frames, container }: GroupOutlineProps) {
  const frame = frames.find((candidate) => candidate.ref === elements[0]?.frame)
  const pending = usePendingBox(frame?.ref ?? '')
  const measured = useMeasures(container, elements)
  const shown = pending ?? frame?.box
  const at = shown && pageBox(shown, frame?.device, frame?.turn)
  if (!at || !measured) return null
  const members: GroupMember[] = measured.map(
    ({ index, box, read, placed, nested }) => ({
      index,
      box,
      placed: placed && !nested ? placed : null,
      read,
    }),
  )
  const bounds = groupBounds(members)
  if (!bounds) return null
  const group = (
    <div
      data-element-group
      className="pointer-events-none absolute"
      style={{
        left: at.x + bounds.x,
        top: at.y + bounds.y,
        width: bounds.width,
        height: bounds.height,
        outline: OUTLINE,
        outlineOffset: screen(2),
        zIndex: OVERLAY_Z,
      }}
    >
      {scalesAsGroup(members)
        ? CORNERS.map((corner) => (
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
          ))
        : null}
      <span data-chip className={CHIP}>
        {sizeLabel(bounds)}
      </span>
    </div>
  )
  return (
    <>
      {group}
      {measured.map(({ index, box }) => (
        <div
          key={index}
          data-element-selection
          data-element-index={index}
          className="pointer-events-none absolute"
          style={{
            left: at.x + box.x,
            top: at.y + box.y,
            width: box.width,
            height: box.height,
            outline: MEMBER_OUTLINE,
            zIndex: OVERLAY_Z,
          }}
        />
      ))}
    </>
  )
}

interface ElementOutlineProps extends ElementOverlayProps {
  element: ElementKey | null
}

/** The selected element's outline, corner marks where a drag resizes it, and size chip. */
function ElementOutline({ element, frames, container }: ElementOutlineProps) {
  const frame = frames.find((candidate) => candidate.ref === element?.frame)
  const pending = usePendingBox(frame?.ref ?? '')
  const [measure] = useMeasures(container, element ? [element] : []) ?? []
  const rect = measure?.box ?? null
  const held = useStore(heldStore, (state) => state.held)
  const shown = pending ?? frame?.box
  const at = shown && pageBox(shown, frame?.device, frame?.turn)
  const holds = held !== null && held.key.frame === element?.frame
  // A box measured under another key ends the hold.
  const settled = holds && rect !== null && !sameKey(held.key, element)
  useEffect(() => {
    if (held && (!holds || settled)) holdOutline(null)
  }, [held, holds, settled])
  const box =
    holds && !settled
      ? held.box
      : at && rect
        ? { ...rect, x: at.x + rect.x, y: at.y + rect.y }
        : null
  if (!box) return null
  const read = holds && !settled ? held.read : (measure?.read ?? null)
  return (
    <>
      <CanvasMediaBar element={element} box={box} container={container} />
      {at ? (
        <TurnSurface
          element={element}
          box={box}
          frame={at}
          container={container}
        />
      ) : null}
      <div
        data-element-selection
        className="pointer-events-none absolute"
        style={{
          left: box.x,
          top: box.y,
          width: box.width,
          height: box.height,
          outline: OUTLINE,
          outlineOffset: screen(2),
          zIndex: OVERLAY_Z,
        }}
      >
        {read
          ? CORNERS.map((corner) => (
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
            ))
          : null}
        <span data-chip className={CHIP}>
          {sizeLabel(box, read?.hugsHeight ? 'height' : undefined)}
        </span>
      </div>
    </>
  )
}

interface CanvasMediaBarProps {
  element: ElementKey | null
  /** The element's box in board pixels. */
  box: Box
  container: HTMLElement | null
}

/** How far inside a video's left, right, and bottom edges its bar sits, in screen pixels. */
const BAR_INSET = 4

/**
 * The media bar at a constant screen size, an audio's under the player rather
 * than over it. It draws in the notes layer, since a press on the frames' layer
 * never reaches it.
 */
function CanvasMediaBar({ element, box, container }: CanvasMediaBarProps) {
  const editing = useMode((state) => state.mode === 'edit')
  const media = useLiveMedia(editing ? element : null)
  const video = media?.reading.tag === 'video'
  const frame = element?.frame
  // The browser's own strip grows with the frame's zoom and the bar never does, so each page hides it under the bar.
  useEffect(() => {
    if (!video || !frame || !container) return
    return followFrame(
      container,
      frame,
      (iframe) => subscribe(iframe, 'hide-strips', {}, () => {}).close,
      () => {},
    )
  }, [video, frame, container])
  const layer = container?.parentElement?.querySelector(
    ':scope > [data-notes-layer]',
  )
  if (!media || !layer) return null
  const width = `calc(${box.width}px * var(--zoom, 1))`
  return createPortal(
    <div className="absolute" style={{ left: box.x, top: box.y + box.height }}>
      {media.reading.tag === 'video' ? (
        <div
          className="pointer-events-auto absolute origin-bottom-left [transform:scale(calc(1/var(--zoom,1)))]"
          style={{
            left: screen(BAR_INSET),
            bottom: screen(BAR_INSET),
            width: `max(0px, calc(${width} - ${BAR_INSET * 2}px))`,
          }}
        >
          <MediaBar media={media} />
        </div>
      ) : (
        <div
          className="pointer-events-auto mt-1.5 origin-top-left [transform:scale(calc(1/var(--zoom,1)))]"
          style={{ width }}
        >
          <MediaBar media={media} />
        </div>
      )}
    </div>,
    layer,
  )
}

function sameKey(a: ElementKey, b: ElementKey | null): boolean {
  return (
    b !== null &&
    a.frame === b.frame &&
    a.index === b.index &&
    a.hash === b.hash
  )
}
