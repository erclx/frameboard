import type { TreeElement } from '@/shared/records/elements'

/**
 * Where a key moves the selection inside one frame's tree. `at` is the
 * selected element's index, null for the frame itself, and each answer is an
 * index, null for the frame, or undefined when the key has nowhere to go.
 */

/** Enter: the first child, the frame's first being the first child of `body`. */
export function down(
  tree: readonly TreeElement[],
  at: number | null,
): number | undefined {
  return tree.find((element) => element.parent === at)?.index
}

/** Esc: the element it sits in, the frame above a child of `body`. */
export function up(
  tree: readonly TreeElement[],
  at: number,
): number | null | undefined {
  return tree.find((element) => element.index === at)?.parent
}

/** Tab, or Shift+Tab with `step` -1: the next or previous sibling, wrapping within the parent. */
export function sibling(
  tree: readonly TreeElement[],
  at: number,
  step: 1 | -1,
): number | undefined {
  const parent = up(tree, at)
  if (parent === undefined) return undefined
  const siblings = tree.filter((element) => element.parent === parent)
  const position = siblings.findIndex((element) => element.index === at)
  const count = siblings.length
  return siblings[(position + step + count) % count]?.index
}

/** An element's place among its siblings and how many there are, undefined for one with no parent. */
export function siblingPlace(
  tree: readonly TreeElement[],
  at: number,
): { place: number; count: number } | undefined {
  const parent = up(tree, at)
  if (parent === undefined) return undefined
  const siblings = tree.filter((element) => element.parent === parent)
  const place = siblings.findIndex((element) => element.index === at)
  return place < 0 ? undefined : { place, count: siblings.length }
}

/**
 * The gap `/api/frames/move` takes to move `at` to another place among its
 * siblings, `to` mapping the place it holds to the one it lands on, counted
 * with it lifted out, out of how many siblings there are. `body` is named by the index just before its first
 * child's, since the file lists an element right ahead of what it holds.
 * Undefined when the place is the one it holds or past either end.
 */
export function siblingGap(
  tree: readonly TreeElement[],
  at: number,
  to: (place: number, count: number) => number,
): { parent: number; before: number | null } | undefined {
  const parent = up(tree, at)
  const first = tree[0]
  if (parent === undefined || !first) return undefined
  const siblings = tree.filter((element) => element.parent === parent)
  const from = siblings.findIndex((element) => element.index === at)
  const place = to(from, siblings.length)
  if (place === from || place < 0 || place >= siblings.length) return undefined
  const rest = siblings.filter((element) => element.index !== at)
  return {
    parent: parent ?? first.index - 1,
    before: rest[place]?.index ?? null,
  }
}
