import { boundsOf, type Box } from '../geometry/box'
import { type Corner, resizeBox, scaleBoxes } from '../geometry/resize'
import type { Margins } from '../place/flow-guess'
import {
  type ElementSize,
  type PlacedOffsets,
  resizeDeclarations,
  type ResizeRead,
} from './resize'

/** One of several selected elements, as a group drag reads it at the press. */
export interface GroupMember {
  index: number
  /** Its outline on the canvas, a border box. */
  box: Box
  /** The `left` and `top` it holds, null for one in the flow, which no group drag moves. */
  placed: PlacedOffsets | null
  /** How it takes a corner resize, null for one sized by what it holds. */
  read: Pick<ResizeRead, 'kind' | 'inset'> | null
  /** The margins the browser computed for it, absent where nothing measured them, which a wrap reads as none. */
  margin?: Margins
}

/** The declarations a group drag writes on one member. */
export interface MemberEdit {
  index: number
  declarations: { property: string; value: string }[]
}

/** The box drawn around every member, null for none. */
export function groupBounds(members: readonly GroupMember[]): Box | null {
  return boundsOf(members.map(({ box }) => box))
}

/**
 * Whether a corner drag scales the group, which takes every member free and
 * each one taking a resize, since a member in the flow or sized by what it
 * holds has no box to scale.
 */
export function scalesAsGroup(members: readonly GroupMember[]): boolean {
  return (
    members.length > 1 &&
    members.every(({ placed, read }) => placed !== null && read !== null)
  )
}

/**
 * The `left` and `top` a move by a canvas offset gives each free member,
 * every one shifted by the same whole pixels so no offset between them
 * changes. A member in the flow is left out, since its place is its
 * container's.
 */
export function moveMembers(
  members: readonly GroupMember[],
  dx: number,
  dy: number,
): MemberEdit[] {
  const ox = Math.round(dx)
  const oy = Math.round(dy)
  return members.flatMap(({ index, placed }) =>
    placed
      ? [
          {
            index,
            declarations: [
              { property: 'left', value: `${placed.left + ox}px` },
              { property: 'top', value: `${placed.top + oy}px` },
            ],
          },
        ]
      : [],
  )
}

/**
 * The group's box after dragging `corner` of `bounds` by a canvas offset,
 * the opposite corner pinned. `keepRatio`, Shift held, scales both sides by
 * whichever moved further, so the group keeps its shape.
 */
export function groupBox(
  bounds: Box,
  corner: Corner,
  dx: number,
  dy: number,
  keepRatio: boolean,
): Box {
  const box = resizeBox(bounds, corner, dx, dy)
  if (!keepRatio || bounds.width <= 0 || bounds.height <= 0) return box
  const scale = Math.max(box.width / bounds.width, box.height / bounds.height)
  const width = Math.max(1, Math.round(bounds.width * scale))
  const height = Math.max(1, Math.round(bounds.height * scale))
  const west = corner === 'nw' || corner === 'sw'
  const north = corner === 'nw' || corner === 'ne'
  return {
    x: west ? bounds.x + bounds.width - width : bounds.x,
    y: north ? bounds.y + bounds.height - height : bounds.y,
    width,
    height,
  }
}

/**
 * What scaling the group from `from` to `to` writes on each member: its
 * offsets moved by as far as its box moved, and its size scaled, so every
 * member keeps its proportion of the group. Text takes its width alone, and
 * no font size changes. A group that does not scale writes nothing.
 */
export function scaleMembers(
  members: readonly GroupMember[],
  from: Box,
  to: Box,
): MemberEdit[] {
  if (!scalesAsGroup(members)) return []
  const scaled = scaleBoxes(
    Object.fromEntries(members.map(({ index, box }) => [index, box])),
    from,
    to,
  )
  return members.flatMap(({ index, box, placed, read }) => {
    const next = scaled[index]
    if (!next || !placed || !read) return []
    const size: ElementSize = { width: next.width, height: next.height }
    return [
      {
        index,
        declarations: [
          {
            property: 'left',
            value: `${Math.round(placed.left + next.x - box.x)}px`,
          },
          {
            property: 'top',
            value: `${Math.round(placed.top + next.y - box.y)}px`,
          },
          ...resizeDeclarations(read, size),
        ],
      },
    ]
  })
}

/**
 * What an align or a distribute writes on each member: its offsets moved by
 * as far as `arranged` moves its box, and nothing on one it leaves in place.
 * It takes every member free, since a flow member's place is its container's,
 * and writes nothing otherwise.
 */
export function arrangeMembers(
  members: readonly GroupMember[],
  arranged: (boxes: Record<string, Box>) => Record<string, Box>,
): MemberEdit[] {
  if (!members.every(({ placed }) => placed !== null)) return []
  const after = arranged(
    Object.fromEntries(members.map(({ index, box }) => [index, box])),
  )
  return members.flatMap(({ index, box, placed }) => {
    const next = after[index]
    if (!next || !placed || (next.x === box.x && next.y === box.y)) return []
    return [
      {
        index,
        declarations: [
          { property: 'left', value: `${placed.left + next.x - box.x}px` },
          { property: 'top', value: `${placed.top + next.y - box.y}px` },
        ],
      },
    ]
  })
}
