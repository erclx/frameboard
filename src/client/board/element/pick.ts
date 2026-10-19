import type { ElementTree } from '@/shared/records/elements'
import type { FrameRecord } from '@/shared/records/list'

import { elementAt, elementIndex, renderedHash } from '../frame-dom'
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
