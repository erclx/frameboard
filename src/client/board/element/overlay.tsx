import { useEffect, useState } from 'react'
import { createPortal } from 'react-dom'
import { useStore } from 'zustand'

import type { FrameRecord } from '@/shared/records/list'

import { elementAt, renderedHash } from '../frame-dom'
import type { Box } from '../geometry/box'
import { OUTLINE, screen, sizeLabel } from '../geometry/draw'
import { CHIP, OVERLAY_Z } from '../geometry/overlay'
import { usePendingBox, usePendingFrames } from '../geometry/write'
import { useMode } from '../mode'
import { type ElementKey, useSelection } from '../selection'
import { groupBounds, type GroupMember, scalesAsGroup } from './group'
import { heldStore, holdOutline } from './held'
import { useLiveMedia } from './media'
import { MediaBar } from './media-bar'
import { overflowing } from './overflow'
import { placedIn, readResize, type ResizeRead } from './resize'

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
 * The ghosts of elements past their frame's edge, under the selected
 * element's outline, its size chip, and the four corner marks of an element
 * a corner drag resizes, the marks at a constant screen size through `--zoom`
 * as the frame selection draws them. Several selected draw one bare outline
 * each, the last picked last, since a corner drag and a size name one element.
 * Each is placed from the live element's box
 * inside the frame's iframe and follows that element as it resizes, so it
 * draws nothing while the frame is a placeholder or shows other bytes than
 * the selection names. The marks take no pointer events, since the gestures
 * find a press on one by where it draws.
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
 * A faint dashed box over the part of each element past its frame's edge,
 * for every selected frame but one that scrolls, where the iframe cannot
 * paint it. It is the
 * element's measured box rather than its pixels, and draws in Edit with the
 * Move tool alone, the one place a press on it is taken.
 */
function ElementGhosts({ frames, container }: ElementOverlayProps) {
  const selected = useSelection((state) => state.frames)
  const moving = useMode(
    (state) => state.mode === 'edit' && state.tool === 'move',
  )
  const drawn = usePendingFrames(frames)
  // A scroll frame shows its overflow by scrolling, so a ghost past its edge
  // would mark content the frame already reaches.
  const walked = moving
    ? selected.filter(
        (ref) => !frames.some((frame) => frame.ref === ref && frame.scroll),
      )
    : []
  const ghosts = useGhosts(container, walked)
  return ghosts.map(({ key, box }) => {
    const frame = drawn.find(({ ref }) => ref === key.frame)
    if (!frame) return null
    return (
      <div
        key={`${key.frame}:${key.index}`}
        data-element-ghost
        data-ghost-frame={key.frame}
        data-ghost-index={key.index}
        data-ghost-hash={key.hash}
        className="pointer-events-none absolute bg-primary/28"
        style={{
          left: frame.box.x + box.x,
          top: frame.box.y + box.y,
          width: box.width,
          height: box.height,
          outline: `${screen(1.5)} dashed var(--primary)`,
          outlineOffset: screen(2),
          clipPath: outsideOf(box, frame.box),
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

/**
 * The elements past the edge of each named frame, read when the frames
 * change, when one loads or its viewport resizes, and when an inline style
 * inside one changes, as a drag's preview writes it. Reads coalesce to one an
 * animation frame. Empty while no frame is named, so the walk runs only under
 * a selection.
 */
function useGhosts(
  container: HTMLElement | null,
  refs: readonly string[],
): Ghost[] {
  const [read, setRead] = useState<{
    key: string
    ghosts: Ghost[]
  } | null>(null)
  const key = refs.join('\n')
  useEffect(() => {
    if (!container || key === '') return
    const wanted = key.split('\n')
    const iframeOf = (ref: string) =>
      container.querySelector<HTMLIFrameElement>(
        `[data-frame="${CSS.escape(ref)}"] iframe`,
      )
    // Each node is observed once, since an observe fires a first callback
    // and observing again on every read would read on every frame. That first
    // callback reports the size the read observing it already saw, so it is
    // skipped.
    const sized = new WeakSet<Element>()
    const seen = new WeakSet<Element>()
    const styled = new WeakSet<Node>()
    let pending = 0
    const later = () => {
      if (pending === 0) pending = requestAnimationFrame(measure)
    }
    const resizes = new ResizeObserver((entries) => {
      const fresh = entries.filter(({ target }) => !seen.has(target))
      for (const { target } of fresh) seen.add(target)
      if (fresh.length < entries.length) later()
    })
    const styles = new MutationObserver(later)
    const measure = () => {
      pending = 0
      const ghosts = wanted.flatMap((ref) => {
        const iframe = iframeOf(ref)
        if (!iframe) return []
        if (!sized.has(iframe)) {
          sized.add(iframe)
          resizes.observe(iframe)
        }
        const shown = iframe.contentDocument
        const hash = shown ? renderedHash(shown) : null
        if (!shown || hash === null) return []
        if (!styled.has(shown)) {
          styled.add(shown)
          styles.observe(shown, {
            attributes: true,
            attributeFilter: ['style'],
            subtree: true,
          })
        }
        return overflowing(shown).map(({ index, box }) => ({
          key: { frame: ref, index, hash },
          box,
        }))
      })
      setRead({ key, ghosts })
    }
    measure()
    // A load does not bubble, so a frame mounting or reloading is caught on the way down.
    container.addEventListener('load', measure, true)
    return () => {
      container.removeEventListener('load', measure, true)
      cancelAnimationFrame(pending)
      resizes.disconnect()
      styles.disconnect()
    }
  }, [container, key])
  return read?.key === key ? read.ghosts : []
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
 * One box around several selected elements with their size in its chip, as
 * a design tool draws a selection, and four corner marks while every member
 * is free and takes a corner resize, since only then does a corner drag
 * scale them. Each member keeps a thin outline of its own, drawn after the
 * box so the last picked reads last. Both follow a drag's preview, since the
 * measure watches the members' inline styles, and draw once every member
 * measures.
 */
function GroupOutline({ elements, frames, container }: GroupOutlineProps) {
  const frame = frames.find((candidate) => candidate.ref === elements[0]?.frame)
  const pending = usePendingBox(frame?.ref ?? '')
  const measured = useElementMeasures(container, elements)
  const at = pending ?? frame?.box
  if (!at || !measured) return null
  const members: GroupMember[] = measured.map(({ index, box, read, free }) => ({
    index,
    box,
    placed: free ? { left: 0, top: 0 } : null,
    read,
  }))
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
  const measure = useElementMeasure(container, element)
  const rect = measure?.box ?? null
  const held = useStore(heldStore, (state) => state.held)
  const at = pending ?? frame?.box
  const holds = held !== null && held.key.frame === element?.frame
  // A box measured for another key than the held one is the reloaded frame,
  // or another element chosen, either of which the hold gives way to.
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
 * The media bar of a selected `<video>` or `<audio>` in Edit, at a constant
 * screen size. A video's draws inside its bottom edge at its width less the
 * inset on each side, over the strip the browser draws for `controls`, which
 * the hit layer keeps out of reach in Edit. An audio's draws under it at its
 * width, since inside would cover the player. It draws in the notes layer,
 * the board-space layer over the hit layer, since a press on the frames'
 * layer never reaches it, and goes when the frame is culled or reloads other
 * bytes, as the live element does.
 */
function CanvasMediaBar({ element, box, container }: CanvasMediaBarProps) {
  const editing = useMode((state) => state.mode === 'edit')
  const media = useLiveMedia(editing ? element : null)
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

/** A measured member of a group: its box in its frame, how it resizes, and whether it is placed freely. */
interface MemberMeasure {
  index: number
  box: Box
  read: ResizeRead | null
  free: boolean
}

/**
 * Every named element's box inside their one frame, measured as
 * `useElementMeasure` measures one, and again when any of them resizes or
 * its inline style changes, since a group drag previews offsets no
 * `ResizeObserver` sees. Null until all of them measure.
 */
function useElementMeasures(
  container: HTMLElement | null,
  elements: readonly ElementKey[],
): MemberMeasure[] | null {
  const [measured, setMeasured] = useState<{
    key: string
    at: MemberMeasure[] | null
  } | null>(null)
  const frame = elements[0]?.frame
  const hash = elements[0]?.hash
  const indexes = elements.map(({ index }) => index).join(',')
  const key = frame === undefined ? null : `${frame}:${indexes}:${hash}`
  useEffect(() => {
    if (!container || key === null || frame === undefined) return
    const wanted = indexes.split(',').map(Number)
    let stopWatching = () => {}
    const measure = () => {
      stopWatching()
      const document = container.querySelector<HTMLIFrameElement>(
        `[data-frame="${CSS.escape(frame)}"] iframe`,
      )?.contentDocument
      const view = document?.defaultView
      const targets =
        document && view && renderedHash(document) === hash
          ? wanted.flatMap((index) => {
              const target = elementAt(document, index)
              return target ? [{ index, target }] : []
            })
          : []
      if (!document || !view || targets.length !== wanted.length) {
        setMeasured({ key, at: null })
        return
      }
      const read = () => {
        setMeasured({
          key,
          at: targets.map(({ index, target }) => {
            const rect = target.getBoundingClientRect()
            const group = targets.map((member) => member.target)
            return {
              index,
              box: {
                x: Math.round(rect.left),
                y: Math.round(rect.top),
                width: Math.round(rect.width),
                height: Math.round(rect.height),
              },
              read: readResize(target),
              free: placedIn(target, group) !== null,
            }
          }),
        })
      }
      read()
      // Observers from the frame's own window, since the elements live there.
      const observer = new view.ResizeObserver(read)
      const styles = new view.MutationObserver(read)
      for (const { target } of targets) {
        observer.observe(target)
        styles.observe(target, { attributes: true, attributeFilter: ['style'] })
      }
      observer.observe(document.documentElement)
      view.addEventListener('scroll', read, true)
      stopWatching = () => {
        observer.disconnect()
        styles.disconnect()
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
  }, [container, key, frame, indexes, hash])
  return measured?.key === key ? measured.at : null
}

/**
 * The element's box inside its frame, in the frame's own pixels, and how it
 * takes a corner resize, measured again whenever the frame loads, the element
 * resizes, or the frame's page scrolls. Null while no live iframe shows the
 * bytes the key was read from.
 */
function useElementMeasure(
  container: HTMLElement | null,
  element: ElementKey | null,
): { box: Box; read: ResizeRead | null } | null {
  // Held with the key it was measured for, so one element's box never draws on the next.
  const [measured, setMeasured] = useState<{
    key: string
    at: { box: Box; read: ResizeRead | null } | null
  } | null>(null)
  const frame = element?.frame
  const index = element?.index
  const hash = element?.hash
  const key = element ? `${frame}:${index}:${hash}` : null
  useEffect(() => {
    if (!container || key === null) return
    if (frame === undefined || index === undefined) return
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
        setMeasured({ key, at: null })
        return
      }
      const read = () => {
        const rect = target.getBoundingClientRect()
        setMeasured({
          key,
          at: {
            box: {
              x: Math.round(rect.left),
              y: Math.round(rect.top),
              width: Math.round(rect.width),
              height: Math.round(rect.height),
            },
            read: readResize(target),
          },
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
  return measured?.key === key ? measured.at : null
}

function sameKey(a: ElementKey, b: ElementKey | null): boolean {
  return (
    b !== null &&
    a.frame === b.frame &&
    a.index === b.index &&
    a.hash === b.hash
  )
}
