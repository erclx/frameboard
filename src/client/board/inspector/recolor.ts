import { toast } from '@/client/components/ui/toast'
import { BoardWriteError, writeBoard } from '@/client/live/write'
import type { RecolorResult } from '@/shared/records/edit'
import type { StyleValue } from '@/shared/records/elements'

import { WaitDropped, whenFree } from '../claims/waiting'
import {
  awaitHash,
  rememberHash,
  selectElement,
  type SelectionStore,
  selectionStore,
  settleLanded,
  settleRefused,
} from '../selection'
import { chipName } from './element/values'
import { inFrameTurn, type Landed, sentence, shownHash } from './element/write'

/** What a replace covers: the selected element's subtree, or the whole frame with no index. */
export interface RecolorTarget {
  frame: string
  index?: number
  /** The bytes the selection was read from, which the server refuses once the file moved. */
  hash: string
}

export interface RecolorNotice {
  title: string
  description: string
  type: 'success' | 'warning'
}

export interface RecolorDeps {
  selection?: SelectionStore
  send?: typeof fetch
  notify?: (notice: RecolorNotice) => void
}

/**
 * Writes `token` in place of the raw color `from` on every element of the
 * target that states it inline, as one step one undo puts back. It goes in
 * the frame's turn behind any element edit, from the hash that edit
 * answered, and waits under a claim as an edit does. The selected element
 * stays selected at the hash written, since a replace moves no index. A
 * toast names how many elements changed, or that none stated the color
 * inline. Answers whether it landed.
 */
export async function replaceColor(
  page: string,
  target: RecolorTarget,
  from: StyleValue,
  token: string,
  {
    selection = selectionStore,
    send = fetch,
    notify = (notice) => toast.add({ ...notice, timeout: 4000 }),
  }: RecolorDeps = {},
): Promise<boolean> {
  const ref = target.frame
  const shown = from.value.replace(/^#/, '')
  const landed = await inFrameTurn(ref, async (prior): Promise<Landed> => {
    const before = prior ? await prior : undefined
    if (before === null) return null
    // A replace moves no index, so it follows any edit ahead that landed in place.
    const rebased =
      before !== undefined &&
      before.from.includes(target.hash) &&
      !before.shifted
    const hash = rebased ? before.to : target.hash
    let done = () => {}
    try {
      const answer = await whenFree([ref], 'edit', async () => {
        // Held from the send, so a wait of minutes never skips the frame's hash check.
        done = awaitHash(ref)
        rememberHash(ref, hash)
        try {
          return await writeBoard<RecolorResult>(
            '/api/frames/recolor',
            {
              ref,
              hash,
              ...(target.index === undefined ? {} : { index: target.index }),
              from: { value: from.value, percent: from.percent },
              to: token,
            },
            'POST',
            send,
          )
        } catch (error) {
          done()
          throw error
        }
      })
      rememberHash(ref, answer.hash)
      const held = selection.getState().element
      if (held?.frame === ref && held.index === target.index) {
        selectElement(selection, page, { ...held, hash: answer.hash })
      }
      done()
      settleLanded(selection, shownHash)
      notify(
        answer.count === 0
          ? {
              title: 'Nothing replaced',
              description: `No element here sets ${shown} inline. A style rule sets it, and a replace leaves rules alone.`,
              type: 'warning',
            }
          : {
              title: `Replaced ${shown} with ${chipName(token)}`,
              description: `In ${answer.count} ${answer.count === 1 ? 'element' : 'elements'}.`,
              type: 'success',
            },
      )
      return {
        from: [...(rebased ? before.from : []), hash],
        to: answer.hash,
        at: new Map(rebased ? before.at : []),
        shifted: false,
      }
    } catch (error) {
      if (!(error instanceof WaitDropped)) {
        notify({
          title: 'Nothing replaced',
          description:
            error instanceof BoardWriteError
              ? sentence(error.message)
              : 'The board could not be reached, so nothing was written.',
          type: 'warning',
        })
      }
      done()
      settleRefused(selection, shownHash)
      return null
    }
  })
  return landed !== null
}
