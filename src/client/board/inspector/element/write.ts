import { toast } from '@/client/components/ui/toast'
import { BoardWriteError, writeBoard } from '@/client/live/write'
import type { EditResult } from '@/shared/records/edit'

import { WaitDropped, whenFree } from '../../claims/waiting'
import { renderedHash } from '../../frame-dom'
import {
  awaitHash,
  type ElementKey,
  rememberHash,
  selectElement,
  type SelectionStore,
  selectionStore,
  settleLanded,
  settleRefused,
} from '../../selection'
import type { NumberChange } from '../number-field'

/** One change to the selected element, as `POST /api/frames/edit` takes it. */
export type ElementChange =
  | { kind: 'style'; property: string; value: string }
  | { kind: 'attribute'; name: string; value: string }
  | { kind: 'text'; value: string }

/** Sends one change for the selected element and answers whether it was written. */
export type WriteElement = (change: ElementChange) => Promise<boolean>

export interface WriteDeps {
  selection?: SelectionStore
  send?: typeof fetch
  /** Shows a refusal, the kit's toast by default. */
  notify?: (refusal: { title: string; description: string }) => void
}

/** The hashes an element edit went from and to, null when it was not written. */
type Landed = { from: readonly string[]; to: string } | null

/** Each frame's latest element edit, which the next edit of that frame goes behind. */
const queues = new Map<string, Promise<Landed>>()

/**
 * Writes one change into the element `key` names, made from the hash its
 * frame rendered, so an agent's write in between is refused as stale. The
 * answered hash goes to the selection at once, before the watcher reloads
 * the frame, which leaves its hash check to this write until it answers. A
 * refusal raises the toast and answers false, so the field shows the stored
 * value.
 *
 * Edits of one frame go in order. While another session holds the frame an
 * edit waits, and one made from the hash an earlier waiting edit started
 * from is sent from the hash that one answered, so neither is lost nor sent
 * on bytes the file no longer holds. A refusal drops the edits behind it.
 */
export function writeElement(
  page: string,
  key: ElementKey,
  change: ElementChange,
  deps: WriteDeps = {},
): Promise<boolean> {
  const turn = editInTurn(queues.get(key.frame), page, key, change, deps)
  queues.set(key.frame, turn)
  return turn.then((landed) => {
    if (queues.get(key.frame) === turn) queues.delete(key.frame)
    return landed !== null
  })
}

async function editInTurn(
  prior: Promise<Landed> | undefined,
  page: string,
  key: ElementKey,
  change: ElementChange,
  {
    selection = selectionStore,
    send = fetch,
    notify = (refusal) =>
      // The refusal is the only record that the edit was dropped, so it stays until dismissed.
      toast.add({ ...refusal, type: 'warning', timeout: 0 }),
  }: WriteDeps,
): Promise<Landed> {
  const before = prior ? await prior : undefined
  // The refused edit's toast speaks for the ones queued behind it.
  if (before === null) {
    settleRefused(selection, shownHash)
    return null
  }
  const follows = before !== undefined && before.from.includes(key.hash)
  const hash = follows ? before.to : key.hash
  let done = () => {}
  try {
    const answer = await whenFree([key.frame], 'edit', async () => {
      // Held from the send, so a wait of minutes never skips the frame's hash check.
      done = awaitHash(key.frame)
      // The frame still shows these bytes when the answer lands, its reload to come.
      rememberHash(key.frame, hash)
      try {
        return await writeBoard<EditResult>(
          '/api/frames/edit',
          { ref: key.frame, index: key.index, hash, change },
          'POST',
          send,
        )
      } catch (error) {
        done()
        throw error
      }
    })
    rememberHash(key.frame, answer.hash)
    const held = selection.getState().element
    if (held?.frame === key.frame && held.index === key.index) {
      selectElement(selection, page, { ...key, hash: answer.hash })
    }
    done()
    settleLanded(selection, shownHash)
    return {
      from: follows ? [...before.from, hash] : [key.hash],
      to: answer.hash,
    }
  } catch (error) {
    if (!(error instanceof WaitDropped)) {
      notify({
        title: 'Edit not saved',
        description:
          error instanceof BoardWriteError
            ? sentence(error.message)
            : 'The board could not be reached, so nothing was written.',
      })
    }
    done()
    settleRefused(selection, shownHash)
    return null
  }
}

/** The hash of the bytes a frame's live iframe shows, null while none does. */
export function shownHash(ref: string): string | null {
  const shown = document.querySelector<HTMLIFrameElement>(
    `[data-frame="${CSS.escape(ref)}"] iframe`,
  )?.contentDocument
  return shown ? renderedHash(shown) : null
}

/** The writer's detail, which starts lowercase for the CLI's line, as a sentence. */
function sentence(detail: string): string {
  const text = detail.charAt(0).toUpperCase() + detail.slice(1)
  return /[.!?]$/.test(text) ? text : `${text}.`
}

/** Shows one declaration on the selected element before it is written, or puts back the one it replaced on null. */
export type PreviewStyle = (property: string, value: string | null) => void

/**
 * A number field's preview and write for one declaration of the selected
 * element, from the value it shows, `css` giving the declaration's value for
 * a number.
 */
export function styleNumber(
  property: string,
  from: number,
  css: (value: number) => string,
  write: WriteElement,
  preview?: PreviewStyle,
): {
  onPreview: (change: NumberChange | null) => void
  onCommit: (change: NumberChange) => Promise<boolean>
} {
  return {
    onPreview: (change) =>
      preview?.(property, change ? css(change(from)) : null),
    onCommit: (change) =>
      write({ kind: 'style', property, value: css(change(from)) }),
  }
}
