import { toast } from '@/client/components/ui/toast'
import { liveStore } from '@/client/live/store'

import { elementAt, renderedHash } from '../frame-dom'
import type { Box } from '../geometry/box'
import { type Corner, resizeBox } from '../geometry/resize'
import { degreesOf, previewStyle } from '../inspector/element/styles'
import { writeElement } from '../inspector/element/write'
import type { ElementKey } from '../selection'

/** A shape's size in its frame's CSS pixels. */
export interface ShapeSize {
  width: number
  height: number
}

/**
 * Whether an element is a shape, a box holding no element and no text, as a
 * placed Rectangle or Ellipse is. Text and a divider are sized by what they
 * hold or by their line, so their corners take no resize.
 */
export function isShape(element: Element | null): boolean {
  return (
    element?.localName === 'div' &&
    element.childElementCount === 0 &&
    (element.textContent ?? '').trim() === ''
  )
}

/**
 * The size dragging `corner` of a shape drawn at `start` by a canvas offset
 * makes, at least 1 px a side and never flipped. `keepRatio`, Shift held,
 * scales both sides by whichever moved further, so an Ellipse stays a circle.
 */
export function shapeSize(
  start: Box,
  corner: Corner,
  dx: number,
  dy: number,
  keepRatio: boolean,
): ShapeSize {
  const { width, height } = resizeBox(start, corner, dx, dy)
  // A side drawn at 0 px has no ratio to keep.
  if (!keepRatio || start.width <= 0 || start.height <= 0) {
    return { width, height }
  }
  const scale = Math.max(width / start.width, height / start.height)
  return {
    width: Math.max(1, Math.round(start.width * scale)),
    height: Math.max(1, Math.round(start.height * scale)),
  }
}

/** A corner drag of one shape, previewed on its live node and written once on release. */
export interface ShapeResize {
  preview: (size: ShapeSize) => void
  /** Writes the size as one edit, putting the preview back when it is refused. */
  commit: (size: ShapeSize) => Promise<boolean>
  /** Puts the preview back with nothing written. */
  cancel: () => void
}

/**
 * Whether the element `key` names is an upright shape in a live frame
 * showing the bytes it was read from. A rotated shape's outline is its
 * turned bounding box, whose corners are not the element's own, so it takes
 * no corner resize.
 */
export function isShownShape(container: ParentNode, key: ElementKey): boolean {
  const shown = container.querySelector<HTMLIFrameElement>(
    `[data-frame="${CSS.escape(key.frame)}"] iframe`,
  )?.contentDocument
  if (!shown || renderedHash(shown) !== key.hash) return false
  const element = elementAt(shown, key.index)
  const rotate = element
    ? shown.defaultView?.getComputedStyle(element).rotate
    : undefined
  return isShape(element) && rotate !== undefined && degreesOf(rotate) === 0
}

/**
 * Starts a resize of the shape `key` names, or answers null for a frame
 * another session holds, refused with the claim's toast before anything
 * previews, since the write would be refused once the drag ends.
 */
export function startShapeResize(
  page: string,
  key: ElementKey,
): ShapeResize | null {
  const holder = liveStore.getState().claims[key.frame]
  if (holder) {
    toast.add({
      title: 'Nothing resized',
      description: `${holder.tag} is editing ${key.frame.split('/').at(-1)}, so nothing was written.`,
      type: 'warning',
    })
    return null
  }
  const show = (size: ShapeSize | null) => {
    previewStyle(key, 'width', size ? `${size.width}px` : null)
    previewStyle(key, 'height', size ? `${size.height}px` : null)
  }
  return {
    preview: show,
    commit: async ({ width, height }) => {
      const written = await writeElement(page, key, {
        kind: 'styles',
        declarations: [
          { property: 'width', value: `${width}px` },
          { property: 'height', value: `${height}px` },
        ],
      })
      // A landed write reloads the frame with the size, so only a refusal puts it back.
      if (!written) show(null)
      return written
    },
    cancel: () => show(null),
  }
}

/** A placed element's `left` and `top` in its frame's CSS pixels. */
export interface PlacedOffsets {
  left: number
  top: number
}

/**
 * The offsets a placed element holds, read off a live frame showing the
 * bytes `key` was read from, or null for one in the flow, whose drag
 * carries it to another gap instead.
 */
export function placedOffsets(
  container: ParentNode,
  key: ElementKey,
): PlacedOffsets | null {
  const shown = container.querySelector<HTMLIFrameElement>(
    `[data-frame="${CSS.escape(key.frame)}"] iframe`,
  )?.contentDocument
  if (!shown || renderedHash(shown) !== key.hash) return null
  const element = elementAt(shown, key.index)
  const style = element
    ? shown.defaultView?.getComputedStyle(element)
    : undefined
  if (!style || (style.position !== 'absolute' && style.position !== 'fixed')) {
    return null
  }
  const left = parseFloat(style.left)
  const top = parseFloat(style.top)
  return Number.isNaN(left) || Number.isNaN(top) ? null : { left, top }
}

/** A drag of one placed element, previewed on its live node and written once on release. */
export interface PlacedMove {
  preview: (offsets: PlacedOffsets) => void
  /** Writes the offsets as one edit, putting the preview back when it is refused. */
  commit: (offsets: PlacedOffsets) => Promise<boolean>
  /** Puts the preview back with nothing written. */
  cancel: () => void
}

/**
 * Starts a drag of the placed element `key` names, or answers null for a
 * frame another session holds, refused with the claim's toast before
 * anything previews. It writes `left` and `top` on the element alone, never
 * its parent, since the offsets count from the box that already holds it.
 */
export function startPlacedMove(
  page: string,
  key: ElementKey,
): PlacedMove | null {
  const holder = liveStore.getState().claims[key.frame]
  if (holder) {
    toast.add({
      title: 'Nothing moved',
      description: `${holder.tag} is editing ${key.frame.split('/').at(-1)}, so nothing was written.`,
      type: 'warning',
    })
    return null
  }
  const show = (offsets: PlacedOffsets | null) => {
    previewStyle(key, 'left', offsets ? `${offsets.left}px` : null)
    previewStyle(key, 'top', offsets ? `${offsets.top}px` : null)
  }
  return {
    preview: show,
    commit: async ({ left, top }) => {
      const written = await writeElement(page, key, {
        kind: 'styles',
        declarations: [
          { property: 'left', value: `${left}px` },
          { property: 'top', value: `${top}px` },
        ],
      })
      if (!written) show(null)
      return written
    },
    cancel: () => show(null),
  }
}
