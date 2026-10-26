import { toast } from '@/client/components/ui/toast'
import { type LiveStore, liveStore } from '@/client/live/store'
import { BoardWriteError, writeBoard } from '@/client/live/write'
import type { InsertResult, RemoveResult } from '@/shared/records/edit'
import type { FrameRecord } from '@/shared/records/list'

import { WaitDropped, whenFree } from '../claims/waiting'
import { catchUpTree } from '../element/tree'
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
import { gapUnder } from './gap'

/** What a placement tool writes, as `POST /api/frames/insert` names it. */
export type PlacedKind = 'text' | 'rectangle' | 'ellipse' | 'divider'

export interface PlaceDeps {
  selection?: SelectionStore
  mode?: ModeStore
  live?: LiveStore
  send?: typeof fetch
  /** Shows a refusal, the kit's toast by default. */
  notify?: (refusal: { title: string; description: string }) => void
}

/**
 * Places one element of `kind` into the frame under a board point, at the
 * gap between children `gapUnder` reads there, then selects it and returns to
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
  }: PlaceDeps = {},
): Promise<ElementKey | null> {
  const under = gapUnder(container, frames, at)
  if (!under) return null
  const { frame, hash, gap } = under
  const ref = frame.ref
  const holder = live.getState().claims[ref]
  if (holder) {
    notify({
      title: 'Nothing placed',
      description: `${holder.tag} is editing ${frame.name}, so nothing was written.`,
    })
    return null
  }

  const element = kind === 'divider' ? { kind, vertical: gap.row } : { kind }
  let placed: ElementKey | null = null
  await inFrameTurn(ref, async (prior): Promise<Landed> => {
    const before = prior ? await prior : undefined
    if (before === null) return null
    // An edit ahead that landed in place keeps every index, so the gap
    // holds on the bytes it answered. One found again past an agent's write
    // may not, so the insert goes from its own hash and is refused as stale.
    const rebased =
      before !== undefined && before.from.includes(hash) && !before.shifted
    const from = rebased ? before.to : hash
    const done = awaitHash(ref)
    rememberHash(ref, from)
    try {
      const answer = await writeBoard<InsertResult>(
        '/api/frames/insert',
        { ref, hash: from, parent: gap.parent, before: gap.before, element },
        'POST',
        send,
      )
      rememberHash(ref, answer.hash)
      void catchUpTree(ref, answer.hash)
      placed = { frame: ref, index: answer.index, hash: answer.hash }
      selectElement(selection, page, placed)
      mode.setState({ tool: 'move' })
      // Every index past the gap moved, so no edit queued behind keeps its own.
      return { from: [from], to: answer.hash, at: new Map(), shifted: true }
    } catch (error) {
      notify({
        title: 'Nothing placed',
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
  return placed
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
