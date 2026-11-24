import { toast } from '@/client/components/ui/toast'
import { liveStore } from '@/client/live/store'
import type {
  ElementSize,
  Offsets,
  ResizeRead,
} from '@/shared/frame-bridge/live-element'

import type { Box } from '../geometry/box'
import { type Corner, resizeBox } from '../geometry/resize'
import {
  type Axis,
  sizeDeclarations,
} from '../inspector/element/size-declarations'
import { previewStyle } from '../inspector/element/styles'
import { writeElement, writeElements } from '../inspector/element/write'
import type { ElementKey } from '../selection'
import type { GroupMember, MemberEdit } from './group'
import { hasBox, heldGhost, heldMeasures } from './measures'
import { newTextStore } from './text-in-place'

/** What a corner drag's write reads off the element it resizes. */
export type ResizeTarget = Pick<ResizeRead, 'kind' | 'inset'> &
  Partial<Pick<ResizeRead, 'sizing'>>

/** Whether a canvas layer draws the frame `ref` as a live page. */
function drawsLive(container: ParentNode, ref: string): boolean {
  return (
    container.querySelector(`[data-frame="${CSS.escape(ref)}"] iframe`) !== null
  )
}

/**
 * How the element `key` names takes a corner resize, read from its frame's push
 * at the key's bytes, or null for one that takes none, is locked or not
 * measured, or is a placed Text still open for typing.
 */
export function shownResize(
  container: ParentNode,
  key: ElementKey,
): ResizeRead | null {
  const typing = newTextStore.getState().key
  if (
    typing?.frame === key.frame &&
    typing.index === key.index &&
    typing.hash === key.hash
  ) {
    return null
  }
  if (!drawsLive(container, key.frame)) return null
  const member = heldMeasures([key])?.[0]
  return member && !member.locked ? member.read : null
}

/**
 * The size a corner drag makes, at least 1 px a side and never flipped, with
 * `keepRatio` scaling both sides to `ratio` so an Ellipse stays a circle.
 */
export function cornerSize(
  start: Box,
  corner: Corner,
  dx: number,
  dy: number,
  keepRatio: boolean,
  ratio: ElementSize = start,
): ElementSize {
  const { width, height } = resizeBox(start, corner, dx, dy)
  // A side drawn at 0 px has no ratio to keep.
  if (!keepRatio || ratio.width <= 0 || ratio.height <= 0) {
    return { width, height }
  }
  const scale = Math.max(width / ratio.width, height / ratio.height)
  return {
    width: Math.max(1, Math.round(ratio.width * scale)),
    height: Math.max(1, Math.round(ratio.height * scale)),
  }
}

/**
 * The size a corner drag of the element `read` describes makes. Text takes the
 * horizontal drag alone, which keeps a vertical drag from reading as a change,
 * and media holds the ratio it decodes to.
 */
export function dragSize(
  read: ResizeRead,
  start: Box,
  corner: Corner,
  dx: number,
  dy: number,
  keepRatio: boolean,
): ElementSize {
  return read.kind === 'text'
    ? cornerSize(start, corner, dx, 0, false)
    : cornerSize(start, corner, dx, dy, keepRatio, read.natural ?? start)
}

/**
 * The declarations a corner drag writes. A container writes only the sides
 * the drag moved, as Fixed, so a side the drag left keeps its mode.
 */
export function resizeDeclarations(
  { kind, inset, sizing }: ResizeTarget,
  { width, height }: ElementSize,
): { property: string; value: string }[] {
  const px = (drawn: number, held: number) =>
    Math.max(0, Math.round(drawn - held))
  if (kind === 'container') {
    if (!sizing) return []
    const { layout, fills } = sizing
    const drawn: Record<Axis, number> = { width, height }
    return (['width', 'height'] as const).flatMap((axis) =>
      Math.abs(drawn[axis] - layout[axis]) < 1
        ? []
        : sizeDeclarations(
            layout,
            axis,
            fills ? 'fill' : null,
            'fixed',
            px(drawn[axis], inset[axis]),
          ),
    )
  }
  const wide = { property: 'width', value: `${px(width, inset.width)}px` }
  return kind === 'text'
    ? [wide]
    : [wide, { property: 'height', value: `${px(height, inset.height)}px` }]
}

/** A corner drag of one element, previewed on its live node and written once on release. */
export interface ElementResize {
  preview: (size: ElementSize) => void
  /** Writes the size as one edit, putting the preview back when it is refused. */
  commit: (size: ElementSize) => Promise<boolean>
  /** Puts the preview back with nothing written. */
  cancel: () => void
}

/**
 * Starts a resize of the element `key` names, or answers null for a frame
 * another session holds, refused with the claim's toast before anything
 * previews, since the write would be refused once the drag ends.
 */
export function startElementResize(
  page: string,
  key: ElementKey,
  read: ResizeTarget,
): ElementResize | null {
  const holder = liveStore.getState().claims[key.frame]
  if (holder) {
    toast.add({
      title: 'Nothing resized',
      description: `${holder.tag} is editing ${key.frame.split('/').at(-1)}, so nothing was written.`,
      type: 'warning',
    })
    return null
  }
  // Kept in write order, since a container's flex can land between width and height.
  const shown = new Set<string>()
  // Newest first, since `previewStyle` may restore a `style` holding earlier previews.
  const putBack = () => {
    for (const property of [...shown].toReversed()) {
      previewStyle(key, property, null)
    }
    shown.clear()
  }
  return {
    preview: (size) => {
      putBack()
      for (const { property, value } of resizeDeclarations(read, size)) {
        shown.add(property)
        previewStyle(key, property, value)
      }
    },
    commit: async (size) => {
      // The last preview drew this size, so the frame keeps its page.
      const written = await writeElement(
        page,
        key,
        { kind: 'styles', declarations: resizeDeclarations(read, size) },
        { previewed: true },
      )
      // A landed write leaves the frame at the size, so only a refusal puts it back.
      if (!written) putBack()
      return written
    },
    cancel: putBack,
  }
}

/** A placed element's `left` and `top` in its frame's CSS pixels. */
export type PlacedOffsets = Offsets

/**
 * The offsets a placed element holds, read from what its frame pushed for
 * the selection or its ghost at the key's bytes, or null for a locked one or
 * one in the flow, whose drag carries it to another gap instead.
 */
export function placedOffsets(
  container: ParentNode,
  key: ElementKey,
): PlacedOffsets | null {
  if (!drawsLive(container, key.frame)) return null
  const member = heldMeasures([key])?.[0]
  if (member?.locked) return null
  return member ? member.placed : (heldGhost(key)?.placed ?? null)
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
 * Starts a placed element's drag, null under another session's claim. It
 * writes `left` and `top` on the element alone, since its parent already
 * anchors it.
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
      const written = await writeElement(
        page,
        key,
        {
          kind: 'styles',
          declarations: [
            { property: 'left', value: `${left}px` },
            { property: 'top', value: `${top}px` },
          ],
        },
        { previewed: true },
      )
      if (!written) show(null)
      return written
    },
    cancel: () => show(null),
  }
}

/**
 * The selected elements `keys` names the page draws, as a group drag reads them,
 * each box in its frame's own pixels, off a live frame showing the bytes they
 * were read from, or null while it shows other bytes or misses one.
 */
export function shownGroup(
  container: ParentNode,
  keys: readonly ElementKey[],
): GroupMember[] | null {
  const [first] = keys
  if (!first || !drawsLive(container, first.frame)) return null
  return (
    heldMeasures(keys)
      ?.filter(hasBox)
      .map(({ index, box, placed, nested, read, margin, locked }) => ({
        index,
        box,
        placed: nested ? null : placed,
        read,
        margin,
        locked,
      })) ?? null
  )
}

/** A drag of several elements, previewed on their live nodes and written once on release. */
export interface GroupEdit {
  preview: (edits: readonly MemberEdit[]) => void
  /** Writes every member's declarations as one edit and one undo step, putting the preview back when it is refused. */
  commit: (edits: readonly MemberEdit[]) => Promise<boolean>
  /** Puts the preview back with nothing written. */
  cancel: () => void
}

/**
 * Starts a group drag of the elements `keys` names, all of one frame at one
 * hash, or answers null for a frame another session holds, refused with the
 * claim's toast before anything previews.
 */
export function startGroupEdit(
  page: string,
  keys: readonly ElementKey[],
): GroupEdit | null {
  const [first] = keys
  if (!first) return null
  const holder = liveStore.getState().claims[first.frame]
  if (holder) {
    toast.add({
      title: 'Nothing moved',
      description: `${holder.tag} is editing ${first.frame.split('/').at(-1)}, so nothing was written.`,
      type: 'warning',
    })
    return null
  }
  const keyOf = new Map(keys.map((key) => [key.index, key]))
  const shown = new Set<string>()
  // Newest first, for the reason `startElementResize` puts back that way.
  const putBack = () => {
    for (const at of [...shown].toReversed()) {
      const [index, property] = at.split(':')
      const key = keyOf.get(Number(index))
      if (key && property) previewStyle(key, property, null)
    }
    shown.clear()
  }
  return {
    preview: (edits) => {
      // A container's edit leaves out a side the drag brought back, so each preview starts clean.
      putBack()
      for (const { index, declarations } of edits) {
        const key = keyOf.get(index)
        if (!key) continue
        for (const { property, value } of declarations) {
          shown.add(`${index}:${property}`)
          previewStyle(key, property, value)
        }
      }
    },
    commit: async (edits) => {
      const written = await writeElements(
        page,
        edits.flatMap(({ index, declarations }) => {
          const key = keyOf.get(index)
          return key
            ? [{ key, change: { kind: 'styles' as const, declarations } }]
            : []
        }),
        { previewed: true },
      )
      // A landed write leaves the frame at the offsets, so only a refusal puts them back.
      if (!written) putBack()
      return written
    },
    cancel: putBack,
  }
}
