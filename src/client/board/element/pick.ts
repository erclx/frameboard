import { pageBox } from '@/shared/frame-device'
import type { ElementTree, TreeElement } from '@/shared/records/elements'
import type { FrameRecord } from '@/shared/records/list'

import { request } from '../bridge/channel'
import type { Box } from '../geometry/box'
import { type BoardPoint, type FramePick, readPick } from '../notes/pick'
import type { ElementKey } from '../selection'

/**
 * The deepest stated element in a pick, a script's element giving way to its
 * stated ancestor. Null where the tree was read from other bytes than the
 * frame answered from.
 */
function statedIn(
  pick: FramePick,
  tree: ElementTree | null,
): ElementKey | null {
  const hash = pick.shown?.hash
  if (!hash || tree?.hash !== hash) return null
  for (const { index, tag } of pick.shown?.chain ?? []) {
    const row = tree.elements.find((candidate) => candidate.index === index)
    if (row?.tag === tag) return { frame: pick.frame.ref, index, hash }
  }
  return null
}

/**
 * The deepest element the file states under a point, found as a note pin finds
 * its element, a script's element giving way to its stated ancestor and a
 * locked one to what sits behind it. Null where no held tree vouches for the
 * index.
 */
export async function pickElement(
  container: ParentNode,
  frames: readonly FrameRecord[],
  at: BoardPoint,
  treeOf: (ref: string) => ElementTree | null,
): Promise<ElementKey | null> {
  const pick = await readPick(container, frames, at, { unlocked: true })
  if (!pick || pick.element === null) return null
  return statedIn(pick, treeOf(pick.frame.ref))
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
  const pick = await readPick(container, frames, at, { unlocked: true })
  if (!pick || pick.element === null) return null
  return statedIn(pick, await read(pick.frame.ref))
}

/** Which of a frame's elements a rectangle on the board touches. */
export type Touching = (rect: Box) => { key: ElementKey; box: Box }[]

/**
 * Reads the boxes of a frame's elements once, answering which a rectangle
 * touches, outermost first, none a lock holds and none while the frame shows
 * bytes the tree does not name.
 */
export async function elementsIn(
  container: ParentNode,
  frame: Pick<FrameRecord, 'ref' | 'box' | 'device' | 'turn'>,
  tree: ElementTree | null,
): Promise<Touching> {
  const page = pageBox(frame.box, frame.device, frame.turn)
  const iframe = container.querySelector<HTMLIFrameElement>(
    `[data-frame="${CSS.escape(frame.ref)}"] iframe`,
  )
  const unlocked = unlockedRows(tree?.elements ?? [])
  const boxes =
    tree && iframe
      ? await request(iframe, 'element-boxes', {
          hash: tree.hash,
          indexes: unlocked.map(({ index }) => index),
        })
      : null
  if (!tree || !boxes) return () => []
  const byIndex = new Map(unlocked.map((row) => [row.index, row]))
  return (rect) => {
    const touched = new Map<number, Box>()
    for (const { index, box } of boxes) {
      const shown = {
        x: page.x + box.x,
        y: page.y + box.y,
        width: box.width,
        height: box.height,
      }
      if (touches(shown, rect)) touched.set(index, shown)
    }
    const insideTouched = ({ parent }: TreeElement): boolean =>
      parent !== null &&
      (touched.has(parent) ||
        (byIndex.has(parent) &&
          insideTouched(byIndex.get(parent) as TreeElement)))
    return unlocked.flatMap((row) => {
      const box = touched.get(row.index)
      return box && !insideTouched(row)
        ? [
            {
              key: { frame: frame.ref, index: row.index, hash: tree.hash },
              box,
            },
          ]
        : []
    })
  }
}

/**
 * Whether a point lands on a frame's bare `body`, where a press marquees its
 * elements, false for a frame with no live page or nothing in it.
 */
export async function onBareFrame(
  container: ParentNode,
  frames: readonly FrameRecord[],
  at: BoardPoint,
  tree: ElementTree | null,
): Promise<boolean> {
  if (!tree || tree.elements.length === 0) return false
  const pick = await readPick(container, frames, at, { unlocked: true })
  return (
    pick !== null && pick.element === null && pick.shown?.hash === tree.hash
  )
}

/** The rows no lock holds, a locked row taking what it holds with it. */
function unlockedRows(elements: readonly TreeElement[]): TreeElement[] {
  const locked = new Set<number>()
  return elements.filter((row) => {
    const held =
      row.locked === true || (row.parent !== null && locked.has(row.parent))
    if (held) locked.add(row.index)
    return !held
  })
}

function touches(a: Box, b: Box): boolean {
  return (
    a.x <= b.x + b.width &&
    a.x + a.width >= b.x &&
    a.y <= b.y + b.height &&
    a.y + a.height >= b.y
  )
}
