import { useEffect, useState } from 'react'
import { createPortal } from 'react-dom'
import { useStore } from 'zustand'

import { cn } from '@/client/lib/cn'
import { useLive } from '@/client/live/store'
import { useFrameTheme } from '@/client/theme/store'
import { pageBox } from '@/shared/frame-device'
import type { FrameRecord } from '@/shared/records/list'

import { subscribe } from '../bridge/channel'
import { followFrame } from '../bridge/shown'
import type { Box } from '../geometry/box'
import { OUTLINE, screen, sizeLabel } from '../geometry/draw'
import { CHIP, OVERLAY_Z } from '../geometry/overlay'
import { usePendingBox } from '../geometry/write'
import { useMode } from '../mode'
import { usePreview } from '../preview/store'
import { type ElementKey, useSelection } from '../selection'
import { groupBounds, type GroupMember, scalesAsGroup } from './group'
import { heldStore, holdOutline } from './held'
import { hasBox, useGhosts, useMeasures } from './measures'
import { useLiveMedia } from './media'
import { MediaBar } from './media-bar'
import { drawsOverflow, paintedIndexes, pictureUrl } from './overflow'
import { newTextStore } from './text-in-place'
import { TurnSurface } from './turn-surface'

const CORNERS = [
  { left: 0, top: 0 },
  { left: '100%', top: 0 },
  { left: 0, top: '100%' },
  { left: '100%', top: '100%' },
] as const

/**
 * Below this many of the frame's own pixels on either side, a selected
 * element draws no corner marks, which would sit over its content. A corner
 * drag still resizes it, since the gestures find a corner by position.
 */
const MARKS_MIN = 24

/** A member's outline inside a group's box, thinner so the group reads as one. */
const MEMBER_OUTLINE = `${screen(1)} solid var(--primary)`

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
 * What draws past each frame's edge, where the iframe cannot paint: a dashed
 * ghost a press takes, for a selected frame under the Move tool, and a still
 * picture of the element, in every ghost and for a frame that shows overflow.
 */
function ElementGhosts({ frames, container }: ElementOverlayProps) {
  const selected = useSelection((state) => state.frames)
  // Play scrolls an entered page and shows frames as they ship, so it draws neither.
  const editing = useMode((state) => state.mode === 'edit')
  const moving = useMode((state) => state.tool === 'move')
  if (!editing) return null
  return frames.map((frame) => {
    const ghosted = moving && selected.includes(frame.ref)
    if (!drawsOverflow(frame) || !(ghosted || frame.showOverflow)) return null
    return (
      <FrameGhosts
        key={frame.ref}
        frame={frame}
        ghosted={ghosted}
        container={container}
      />
    )
  })
}

interface FrameGhostsProps {
  frame: FrameRecord
  /** Whether its elements draw as ghosts, or as pictures alone. */
  ghosted: boolean
  container: HTMLElement | null
}

/** One frame's elements past its edge, each in document order so the topmost ghost draws last. */
function FrameGhosts({ frame, ghosted, container }: FrameGhostsProps) {
  const overflow = useGhosts(container, frame.ref)
  const pending = usePendingBox(frame.ref)
  const theme = useFrameTheme(frame.ref)
  const version = useLive(
    ({ reloads, kept }) => (reloads[frame.ref] ?? 0) - (kept[frame.ref] ?? 0),
  )
  // The route lays a frame out at its stored width, so a previewed one has no picture.
  const previewed = usePreview(frame.ref) !== undefined
  if (!overflow) return null
  const page = pageBox(pending ?? frame.box, frame.device, frame.turn)
  const painted = paintedIndexes(overflow.ghosts)
  return overflow.ghosts.map(({ index, box, locked }) => {
    const key = { frame: frame.ref, index, hash: overflow.hash }
    const picture =
      painted.has(index) && !previewed
        ? pictureUrl(key, frame.box, theme, version)
        : null
    // A lock leaves the picture the frame shows past its edge, and no ghost to press.
    const pressed = ghosted && !locked
    if (!pressed && !(picture && frame.showOverflow)) return null
    return (
      <Ghost
        key={index}
        element={key}
        box={box}
        page={page}
        ghosted={pressed}
        order={frame.order}
        picture={picture}
      />
    )
  })
}

interface GhostProps {
  element: ElementKey
  /** The element's box in the frame's own pixels. */
  box: Box
  /** The frame's page on the canvas. */
  page: Box
  ghosted: boolean
  /** The frame's place in the stack, which a picture alone keeps. */
  order: number
  picture: string | null
}

/**
 * One element past its frame's edge. The ghost's attributes stand only on a
 * ghosted one, since `ghostAt` takes a press on whatever carries them.
 */
function Ghost({ element, box, page, ghosted, order, picture }: GhostProps) {
  const [loaded, setLoaded] = useState<string | null>(null)
  return (
    <div
      {...(ghosted
        ? {
            'data-element-ghost': '',
            'data-ghost-frame': element.frame,
            'data-ghost-index': element.index,
            'data-ghost-hash': element.hash,
          }
        : {})}
      className={cn(
        'pointer-events-none absolute',
        ghosted && (picture === null || picture !== loaded) && 'bg-primary/28',
      )}
      style={{
        left: page.x + box.x,
        top: page.y + box.y,
        width: box.width,
        height: box.height,
        ...(ghosted
          ? {
              outline: `${screen(1.5)} dashed var(--primary)`,
              outlineOffset: screen(2),
            }
          : {}),
        clipPath: outsideOf(box, page),
        zIndex: ghosted ? OVERLAY_Z : order,
      }}
    >
      {picture ? (
        // Keyed by its address, so a new one never draws under the old pixels.
        <img
          key={picture}
          src={picture}
          alt=""
          draggable={false}
          className="block size-full max-w-none"
          onLoad={() => setLoaded(picture)}
        />
      ) : null}
    </div>
  )
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
  const measured = useMeasures(container, elements)?.filter(hasBox)
  const shown = pending ?? frame?.box
  const at = shown && pageBox(shown, frame?.device, frame?.turn)
  if (!at || !measured) return null
  const members: GroupMember[] = measured.map(
    ({ index, box, read, placed, nested, locked }) => ({
      index,
      box,
      placed: placed && !nested ? placed : null,
      read,
      locked,
    }),
  )
  const bounds = groupBounds(members)
  if (!bounds) return null
  const group = (
    <div
      data-element-group
      data-element-locked={members.some(({ locked }) => locked) || undefined}
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
      {measured.map(({ index, box, locked }) => (
        <div
          key={index}
          data-element-selection
          data-element-locked={locked || undefined}
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
  const rect = measure && hasBox(measure) ? measure.box : null
  const held = useStore(heldStore, (state) => state.held)
  const typing = useStore(newTextStore, (state) => state.key)
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
  // A placed Text open for typing draws a caret alone, its box kept for a press to read.
  const bare = typing !== null && sameKey(typing, element)
  const locked = measure?.locked === true
  const marked =
    !bare &&
    !locked &&
    read !== null &&
    box.width >= MARKS_MIN &&
    box.height >= MARKS_MIN
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
        data-element-locked={locked || undefined}
        className="pointer-events-none absolute"
        style={{
          left: box.x,
          top: box.y,
          width: box.width,
          height: box.height,
          outline: bare ? 'none' : OUTLINE,
          outlineOffset: screen(2),
          zIndex: OVERLAY_Z,
        }}
      >
        {marked
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
        {bare ? null : (
          <span data-chip className={CHIP}>
            {sizeLabel(box, read?.hugsHeight ? 'height' : undefined)}
          </span>
        )}
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
