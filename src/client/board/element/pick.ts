import type { ElementTree, TreeElement } from '@/shared/records/elements'
import type { FrameRecord } from '@/shared/records/list'

import { elementAt, elementIndex, renderedHash } from '../frame-dom'
import type { Box } from '../geometry/box'
import { type BoardPoint, pickAt } from '../notes/pick'
import type { ElementKey } from '../selection'

/**
 * The element a Cmd-click or a double-click selects at a board point: the
 * deepest element under it that the frame's file states, found the way a
 * note pin finds its element, so the two agree and neither picks the page's
 * root or wrappers. An element a frame script added is passed over for its
 * nearest stated ancestor, read off the server's tree, since its live index
 * names nothing in the file. Null over bare canvas, a frame placeholder, a
 * frame's wrappers, an iframe that has not finished a load, or a frame whose
 * tree for the bytes it shows is not held, since then nothing vouches for
 * the index.
 */
export function pickElement(
  container: ParentNode,
  frames: readonly FrameRecord[],
  at: BoardPoint,
  treeOf: (ref: string) => ElementTree | null,
): ElementKey | null {
  const pick = pickAt(container, frames, at)
  if (!pick || pick.element === null) return null
  const document = container.querySelector<HTMLIFrameElement>(
    `[data-frame="${CSS.escape(pick.frame.ref)}"] iframe`,
  )?.contentDocument
  const hash = document ? renderedHash(document) : null
  if (!document || !hash) return null

  // A tree read from other bytes than the iframe shows cannot vouch for an index.
  const tree = treeOf(pick.frame.ref)
  if (tree?.hash !== hash) return null
  for (
    let element = elementAt(document, pick.element);
    element && element !== document.body;
    element = element.parentElement
  ) {
    const index = elementIndex(document, element)
    if (index === null) continue
    const row = tree.elements.find((candidate) => candidate.index === index)
    if (row?.tag === element.localName) {
      return { frame: pick.frame.ref, index, hash }
    }
  }
  return null
}

/**
 * Picks as `pickElement` does once the frame under the point has its tree,
 * reading it first when the click lands before the tree has arrived, as the
 * Cmd-click that follows a frame's first selection does.
 */
export async function pickElementRead(
  container: ParentNode,
  frames: readonly FrameRecord[],
  at: BoardPoint,
  read: (ref: string) => Promise<ElementTree | null>,
): Promise<ElementKey | null> {
  const pick = pickAt(container, frames, at)
  if (!pick || pick.element === null) return null
  const tree = await read(pick.frame.ref)
  return tree ? pickElement(container, frames, at, () => tree) : null
}

/** The live document of a frame showing `hash`, null while it shows other bytes or no iframe. */
function shownAt(
  container: ParentNode,
  ref: string,
  hash: string,
): Document | null {
  const document = container.querySelector<HTMLIFrameElement>(
    `[data-frame="${CSS.escape(ref)}"] iframe`,
  )?.contentDocument
  return document && renderedHash(document) === hash ? document : null
}

/**
 * The elements a canvas rectangle touches inside one frame, with their boxes
 * on the canvas, outermost first in the frame's order, one held inside a
 * touched one left to it. Empty while the frame shows other bytes than the
 * tree names, since then nothing vouches for an index.
 */
export function elementsIn(
  container: ParentNode,
  frame: Pick<FrameRecord, 'ref' | 'box'>,
  rect: Box,
  tree: ElementTree | null,
): { key: ElementKey; box: Box }[] {
  const document = tree ? shownAt(container, frame.ref, tree.hash) : null
  if (!tree || !document) return []
  const touched = new Map<number, Box>()
  for (const { index } of tree.elements) {
    const shape = elementAt(document, index)?.getBoundingClientRect()
    if (!shape || shape.width === 0 || shape.height === 0) continue
    const box = {
      x: frame.box.x + shape.left,
      y: frame.box.y + shape.top,
      width: shape.width,
      height: shape.height,
    }
    if (touches(box, rect)) touched.set(index, box)
  }
  const byIndex = new Map(tree.elements.map((row) => [row.index, row]))
  const insideTouched = ({ parent }: TreeElement): boolean =>
    parent !== null &&
    (touched.has(parent) ||
      (byIndex.has(parent) &&
        insideTouched(byIndex.get(parent) as TreeElement)))
  return tree.elements.flatMap((row) => {
    const box = touched.get(row.index)
    return box && !insideTouched(row)
      ? [{ key: { frame: frame.ref, index: row.index, hash: tree.hash }, box }]
      : []
  })
}

/**
 * Whether a board point inside a frame lands on its bare `body`, where a
 * press starts a marquee of its elements, rather than on an element it holds.
 * False for a frame with no live page or with nothing in it, which a drag
 * still moves, as it does when no element is there to select.
 */
export function onBareFrame(
  container: ParentNode,
  frames: readonly FrameRecord[],
  at: BoardPoint,
  tree: ElementTree | null,
): boolean {
  const pick = pickAt(container, frames, at)
  if (!pick || pick.element !== null || !tree) return false
  if (tree.elements.length === 0) return false
  return shownAt(container, pick.frame.ref, tree.hash) !== null
}

function touches(a: Box, b: Box): boolean {
  return (
    a.x <= b.x + b.width &&
    a.x + a.width >= b.x &&
    a.y <= b.y + b.height &&
    a.y + a.height >= b.y
  )
}
