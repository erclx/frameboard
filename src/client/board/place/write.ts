import { toast } from '@/client/components/ui/toast'
import { type LiveStore, liveStore } from '@/client/live/store'
import { BoardWriteError, writeBoard } from '@/client/live/write'
import type {
  InsertResult,
  MoveResult,
  PlaceResult,
  RemoveResult,
} from '@/shared/records/edit'
import type { ElementTree } from '@/shared/records/elements'
import type { FrameRecord } from '@/shared/records/list'

import { assetUrl } from '../assets/describe'
import type { PlaceableFile } from '../assets/drag'
import { WaitDropped, whenFree } from '../claims/waiting'
import { catchUpTree, fetchTree, treeOf } from '../element/tree'
import { siblingGap } from '../element/walk'
import { inFrameTurn, type Landed, sentence } from '../inspector/element/write'
import { type ModeStore, modeStore } from '../mode'
import type { BoardPoint } from '../notes/pick'
import {
  awaitHash,
  type ElementKey,
  rememberHash,
  select,
  selectElement,
  type SelectionStore,
  selectionStore,
} from '../selection'
import { type AssetSize, naturalSize, placedSize } from './asset-size'
import { type FrameGap, gapUnder, moveGapUnder } from './gap'

/** What a placement tool writes, as `POST /api/frames/insert` names it. */
export type PlacedKind = 'text' | 'rectangle' | 'ellipse' | 'divider' | 'asset'

export interface PlaceDeps {
  selection?: SelectionStore
  mode?: ModeStore
  live?: LiveStore
  send?: typeof fetch
  /** Shows a refusal, the kit's toast by default. */
  notify?: (refusal: { title: string; description: string }) => void
  /**
   * A rectangle's, an ellipse's, or a file's size in CSS pixels as a drag
   * drew it, else the default 100 by 100, or for a file `placedSize`.
   */
  size?: { width: number; height: number }
  /** The file an asset places, with the size it draws at on its own. */
  asset?: { path: string; natural: AssetSize | null }
}

/**
 * Places one element of `kind` into the frame under a board point, at the
 * gap between children `gapUnder` reads there, an asset naming the file it
 * shows, then selects it and returns to
 * Move, as one click of a placement tool. It answers the new element, or
 * null when nothing was written. A frame another session holds is refused
 * with nothing sent, since its indices go stale when that session writes,
 * and so is one whose iframe has not finished a load.
 *
 * The insert goes in the frame's turn behind any element edit still in
 * flight, from the hash that edit answered, and the hash it answers goes to
 * the selection before the frame reloads, as an element edit's does.
 */
export async function placeElement(
  container: ParentNode,
  page: string,
  frames: readonly FrameRecord[],
  at: BoardPoint,
  kind: PlacedKind,
  {
    selection = selectionStore,
    mode = modeStore,
    live = liveStore,
    send = fetch,
    notify = (refusal) => toast.add({ ...refusal, type: 'warning' }),
    size,
    asset,
  }: PlaceDeps = {},
): Promise<ElementKey | null> {
  const under = gapUnder(container, frames, at)
  if (!under || (kind === 'asset' && !asset)) return null
  const { gap } = under
  const element =
    kind === 'asset' && asset
      ? {
          kind,
          path: asset.path,
          ...(size ?? placedSize(asset.natural, gap.room)),
        }
      : kind === 'divider'
        ? { kind, vertical: gap.row }
        : kind === 'text' || !size
          ? { kind }
          : { kind, ...size }
  return writeAtGap(
    under,
    'Nothing placed',
    (from) => ({
      url: '/api/frames/insert',
      body: {
        ref: under.frame.ref,
        hash: from,
        parent: gap.parent,
        before: gap.before,
        element,
      },
    }),
    (placed) => {
      selectElement(selection, page, placed)
      mode.setState({ tool: 'move' })
    },
    { live, send, notify },
  )
}

/**
 * Places `file` into the frame under a board point as `placeElement` places
 * an asset, at the size a drag drew, else at its natural size read first,
 * capped at its container's width.
 */
export async function placeFile(
  container: ParentNode,
  page: string,
  frames: readonly FrameRecord[],
  at: BoardPoint,
  file: PlaceableFile,
  {
    measure = naturalSize,
    ...deps
  }: PlaceDeps & {
    /** Reads a file's natural size, from the server in the app. */
    measure?: typeof naturalSize
  } = {},
): Promise<ElementKey | null> {
  const natural = deps.size
    ? null
    : await measure(assetUrl(file.project, file.path), file.kind)
  return placeElement(container, page, frames, at, 'asset', {
    ...deps,
    asset: { path: file.path, natural },
  })
}

/**
 * Moves the selected element into the gap under a board point in its own
 * frame, then selects it where it landed, as a drag of the element released
 * there. It answers the element as it now stands, or null when nothing was
 * written, as over another frame, inside the element, or in the gap it
 * already sits in, each of which sends nothing. It goes in the frame's turn
 * as `placeElement` does, refused with nothing sent on a frame another
 * session holds.
 */
export async function moveElement(
  container: ParentNode,
  page: string,
  frames: readonly FrameRecord[],
  at: BoardPoint,
  key: ElementKey,
  {
    selection = selectionStore,
    live = liveStore,
    send = fetch,
    notify = (refusal) => toast.add({ ...refusal, type: 'warning' }),
  }: Omit<PlaceDeps, 'mode' | 'size'> = {},
): Promise<ElementKey | null> {
  const under = moveGapUnder(container, frames, at, key)
  if (!under) return null
  return writeAtGap(
    under,
    'Nothing moved',
    (from) => ({
      url: '/api/frames/move',
      body: {
        ref: key.frame,
        hash: from,
        index: key.index,
        parent: under.gap.parent,
        before: under.gap.before,
      },
    }),
    (moved) => selectElement(selection, page, moved),
    { live, send, notify },
  )
}

/**
 * Moves an element to another place among its siblings, `to` mapping the
 * place it holds to the one it lands on, as a Layers row dropped there or a
 * move key, then selects it where it landed. It answers the element as it
 * now stands, or null when nothing was written. A place past either end, or
 * the one it holds, sends nothing and says nothing.
 *
 * The gap is read in the frame's turn from the tree at the bytes the write
 * goes from, so a move queued behind another goes from the index and hash
 * that one answered rather than from the tree the press saw. A frame another
 * session holds is refused with nothing sent, as `writeAtGap` does.
 */
export async function moveElementTo(
  page: string,
  key: ElementKey,
  to: (place: number, count: number) => number,
  {
    selection = selectionStore,
    live = liveStore,
    send = fetch,
    notify = (refusal) => toast.add({ ...refusal, type: 'warning' }),
    tree = treeAtHash,
  }: Omit<PlaceDeps, 'mode' | 'size'> & {
    /** The frame's tree at a hash, null when it no longer holds those bytes. */
    tree?: (ref: string, hash: string) => Promise<ElementTree | null>
  } = {},
): Promise<ElementKey | null> {
  const ref = key.frame
  const holder = live.getState().claims[ref]
  if (holder) {
    notify({
      title: 'Nothing moved',
      description: `${holder.tag} is editing ${ref.split('/').at(-1) ?? ref}, so nothing was written.`,
    })
    return null
  }

  let landed: ElementKey | null = null
  await inFrameTurn(ref, async (prior): Promise<Landed> => {
    const before = prior ? await prior : undefined
    if (before === null) return null
    // A move ahead of this one answered where the element went, so this one
    // follows it there, whichever hash of the chain the press read. Any other
    // write ahead that shifted indices leaves the element's own, which the
    // server refuses as stale.
    const follows = before !== undefined && before.from.includes(key.hash)
    const moved = follows
      ? (before.moves?.get(slot(key.hash, key.index)) ??
        before.at.get(key.index))
      : undefined
    const rebased = follows && (!before.shifted || moved !== undefined)
    const from = rebased ? before.to : key.hash
    const index = rebased ? (moved ?? key.index) : key.index
    const held = await tree(ref, from)
    if (!held) {
      notify({
        title: 'Nothing moved',
        description:
          'The frame changed since it was read, so nothing was written.',
      })
      return null
    }
    const gap = siblingGap(held.elements, index, to)
    // Nothing written keeps every index, so a write behind goes as it would have.
    if (!gap) {
      return before ?? { from: [from], to: from, at: new Map(), shifted: false }
    }
    const done = awaitHash(ref)
    rememberHash(ref, from)
    try {
      const answer = await writeBoard<MoveResult>(
        '/api/frames/move',
        { ref, hash: from, index, parent: gap.parent, before: gap.before },
        'POST',
        send,
      )
      rememberHash(ref, answer.hash)
      void catchUpTree(ref, answer.hash)
      landed = { frame: ref, index: answer.index, hash: answer.hash }
      selectElement(selection, page, landed)
      const at = new Map(follows ? before.at : [])
      at.set(key.index, answer.index)
      // Every other element's index shifted by an amount nobody read, so
      // only this element's addresses carry forward.
      const moves = new Map<string, number>()
      for (const [address, now] of (follows && before.moves) || []) {
        if (now === index) moves.set(address, answer.index)
      }
      moves.set(slot(key.hash, key.index), answer.index)
      moves.set(slot(from, index), answer.index)
      return {
        from: follows ? [...before.from, from] : [from],
        to: answer.hash,
        at,
        shifted: true,
        moves,
      }
    } catch (error) {
      notify({
        title: 'Nothing moved',
        description:
          error instanceof BoardWriteError
            ? sentence(error.message)
            : 'The board could not be reached, so nothing was written.',
      })
      return null
    } finally {
      done()
    }
  })
  return landed
}

/** The key a sibling move's trace files an element under, by the bytes and index it was addressed at. */
function slot(hash: string, index: number): string {
  return `${hash}\n${index}`
}

/** A frame's tree at the bytes `hash` names, the held one when it agrees, else read again. */
async function treeAtHash(
  ref: string,
  hash: string,
): Promise<ElementTree | null> {
  const held = treeOf(ref)
  if (held?.hash === hash) return held
  const read = await fetchTree(ref).catch(() => null)
  return read?.hash === hash ? read : null
}

/**
 * Sends one write whose indices a gap read off the rendered frame, in the
 * frame's turn behind any element edit still in flight, from the hash that
 * edit answered, and hands the hash it answers to the selection before the
 * frame reloads. A frame another session holds is refused with nothing
 * sent, since its indices go stale when that session writes.
 */
async function writeAtGap(
  { frame, hash }: FrameGap,
  title: string,
  request: (from: string) => { url: string; body: unknown },
  land: (key: ElementKey) => void,
  { live, send, notify }: Required<Pick<PlaceDeps, 'live' | 'send' | 'notify'>>,
): Promise<ElementKey | null> {
  const ref = frame.ref
  const holder = live.getState().claims[ref]
  if (holder) {
    notify({
      title,
      description: `${holder.tag} is editing ${frame.name}, so nothing was written.`,
    })
    return null
  }

  let landed: ElementKey | null = null
  await inFrameTurn(ref, async (prior): Promise<Landed> => {
    const before = prior ? await prior : undefined
    if (before === null) return null
    // An edit ahead that landed in place keeps every index, so the gap
    // holds on the bytes it answered. One found again past an agent's write
    // may not, so the write goes from its own hash and is refused as stale.
    const rebased =
      before !== undefined && before.from.includes(hash) && !before.shifted
    const from = rebased ? before.to : hash
    const done = awaitHash(ref)
    rememberHash(ref, from)
    try {
      const { url, body } = request(from)
      const answer = await writeBoard<InsertResult | MoveResult>(
        url,
        body,
        'POST',
        send,
      )
      rememberHash(ref, answer.hash)
      void catchUpTree(ref, answer.hash)
      landed = { frame: ref, index: answer.index, hash: answer.hash }
      land(landed)
      // Every index past the gap moved, so no edit queued behind keeps its own.
      return { from: [from], to: answer.hash, at: new Map(), shifted: true }
    } catch (error) {
      notify({
        title,
        description:
          error instanceof BoardWriteError
            ? sentence(error.message)
            : 'The board could not be reached, so nothing was written.',
      })
      return null
    } finally {
      done()
    }
  })
  return landed
}

/**
 * Deletes the selected element, with what it holds, from the bytes it was
 * selected at, then selects its frame, as Delete does with an element
 * selected. It goes in the frame's turn like a placement, and a frame
 * another session holds waits under the claim card, as an element edit
 * does, rather than racing that session's write. Answers whether it landed.
 */
export async function deleteElement(
  page: string,
  key: ElementKey,
  {
    selection = selectionStore,
    live = liveStore,
    send = fetch,
    notify = (refusal) => toast.add({ ...refusal, type: 'warning' }),
  }: Omit<PlaceDeps, 'mode'> = {},
): Promise<boolean> {
  const ref = key.frame
  const landed = await inFrameTurn(ref, async (prior): Promise<Landed> => {
    const before = prior ? await prior : undefined
    if (before === null) return null
    // An edit ahead that landed in place keeps every index, so the element
    // holds on the bytes it answered, as a placement's gap does.
    const rebased =
      before !== undefined && before.from.includes(key.hash) && !before.shifted
    const from = rebased ? before.to : key.hash
    let done = () => {}
    try {
      const answer = await whenFree(
        [ref],
        'delete',
        async () => {
          // Held from the send, so a wait of minutes never skips the frame's hash check.
          done = awaitHash(ref)
          rememberHash(ref, from)
          try {
            return await writeBoard<RemoveResult>(
              '/api/frames/remove',
              { ref, index: key.index, hash: from },
              'POST',
              send,
            )
          } catch (error) {
            done()
            throw error
          }
        },
        { live },
      )
      rememberHash(ref, answer.hash)
      void catchUpTree(ref, answer.hash)
      select(selection, page, [ref])
      return { from: [from], to: answer.hash, at: new Map(), shifted: true }
    } catch (error) {
      if (!(error instanceof WaitDropped)) {
        notify({
          title: 'Nothing deleted',
          description:
            error instanceof BoardWriteError
              ? sentence(error.message)
              : 'The board could not be reached, so nothing was written.',
        })
      }
      return null
    } finally {
      done()
    }
  })
  return landed !== null
}

/** Where a placed element sits, in CSS pixels against the box it counts from, and the size it rendered at. */
export interface FreeSpot {
  left: number
  top: number
  width?: number
  height?: number
}

/** The element's own `width` and `height` as its style attribute states them, empty when unset. */
export interface InlineSize {
  width: string
  height: string
}

/**
 * The sizes each placement in this tab wrote, by frame and index, so back in
 * flow drops one only while the element still holds the value written. A
 * size an agent or a later edit changed is kept, and a reload forgets them.
 */
const sizesWritten = new Map<string, Partial<InlineSize>>()

function sizeSlot({ frame, index }: Pick<ElementKey, 'frame' | 'index'>) {
  return `${frame}\n${index}`
}

/**
 * Places the selected element at a spot out of the flow, or back in the flow
 * on null, through `POST /api/frames/place`, which writes its start tag and
 * its static parent's as one step, then selects it at the bytes written.
 * Back in flow also drops each size the placement in this tab wrote that
 * `inline` still holds. It
 * goes in the frame's turn from the hash an edit ahead answered, as a delete
 * does, and keeps every index, so an edit queued behind goes as it would
 * have. A frame another session holds is refused with nothing sent, as a
 * move is. Answers whether it landed.
 */
export async function placeFree(
  page: string,
  key: ElementKey,
  spot: FreeSpot | null,
  {
    selection = selectionStore,
    live = liveStore,
    send = fetch,
    notify = (refusal) => toast.add({ ...refusal, type: 'warning' }),
    inline,
  }: Omit<PlaceDeps, 'mode' | 'size'> & {
    /** The element's own sizes as it renders, read back in flow. */
    inline?: InlineSize
  } = {},
): Promise<boolean> {
  const ref = key.frame
  const title = spot ? 'Nothing placed' : 'Nothing moved'
  const written = sizesWritten.get(sizeSlot(key)) ?? {}
  const drop = spot
    ? []
    : (['width', 'height'] as const).filter(
        (axis) =>
          written[axis] !== undefined && inline?.[axis] === written[axis],
      )
  const holder = live.getState().claims[ref]
  if (holder) {
    notify({
      title,
      description: `${holder.tag} is editing ${ref.split('/').at(-1) ?? ref}, so nothing was written.`,
    })
    return false
  }
  const landed = await inFrameTurn(ref, async (prior): Promise<Landed> => {
    const before = prior ? await prior : undefined
    if (before === null) return null
    const rebased =
      before !== undefined && before.from.includes(key.hash) && !before.shifted
    const from = rebased ? before.to : key.hash
    const index = rebased ? (before.at.get(key.index) ?? key.index) : key.index
    const done = awaitHash(ref)
    rememberHash(ref, from)
    try {
      const answer = await writeBoard<PlaceResult>(
        '/api/frames/place',
        { ref, hash: from, index, spot, ...(drop.length > 0 ? { drop } : {}) },
        'POST',
        send,
      )
      rememberHash(ref, answer.hash)
      void catchUpTree(ref, answer.hash)
      selectElement(selection, page, {
        frame: ref,
        index: answer.index,
        hash: answer.hash,
      })
      const slot = sizeSlot({ frame: ref, index: answer.index })
      if (spot) {
        sizesWritten.set(
          slot,
          Object.fromEntries(
            answer.sized.map((axis) => [axis, `${spot[axis] ?? 0}px`]),
          ),
        )
      } else {
        sizesWritten.delete(slot)
      }
      const at = new Map(rebased ? before.at : [])
      at.set(key.index, answer.index)
      return {
        from: rebased ? [...before.from, from] : [from],
        to: answer.hash,
        at,
        shifted: false,
      }
    } catch (error) {
      notify({
        title,
        description:
          error instanceof BoardWriteError
            ? sentence(error.message)
            : 'The board could not be reached, so nothing was written.',
      })
      return null
    } finally {
      done()
    }
  })
  return landed !== null
}
