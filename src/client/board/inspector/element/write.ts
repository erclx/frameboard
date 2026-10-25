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

/** A refused edit as the toast shows it, with the typed text to copy when a text edit was refused. */
export interface Refusal {
  title: string
  description: string
  copy?: string
}

export interface WriteDeps {
  selection?: SelectionStore
  send?: typeof fetch
  /** Shows a refusal, the kit's toast by default. */
  notify?: (refusal: Refusal) => void
}

/**
 * The hashes an element edit's chain went from and to, null when it was not
 * written. `at` maps each element index the chain edited, as its edits were
 * made, to where it now sits, and `shifted` says whether any was found again
 * past an agent's write, after which an index the chain never edited may
 * name another element.
 */
type Landed = {
  from: readonly string[]
  to: string
  at: ReadonlyMap<number, number>
  shifted: boolean
} | null

/** Each frame's latest element edit, which the next edit of that frame goes behind. */
const queues = new Map<string, Promise<Landed>>()

/** Typed text an agent's write refused, by frame and element index, which the Text field shows again as a draft. */
const keptTexts = new Map<string, string>()

function textKey({ frame, index }: Pick<ElementKey, 'frame' | 'index'>) {
  return `${frame}\n${index}`
}

/** The text a refused text edit of this element typed, or null when none is kept. */
export function keptText(
  at: Pick<ElementKey, 'frame' | 'index'>,
): string | null {
  return keptTexts.get(textKey(at)) ?? null
}

/** Drops the text kept for this element, once it is applied again or cancelled. */
export function forgetText(at: Pick<ElementKey, 'frame' | 'index'>): void {
  keptTexts.delete(textKey(at))
}

/**
 * Writes one change into the element `key` names, made from the hash its
 * frame rendered. The server finds the element again past an agent's write
 * to the frame by the bytes the change reads, and refuses as stale once the
 * agent changed those. The answered hash goes to the selection at once,
 * before the watcher reloads the frame, which leaves its hash check to this
 * write until it answers, and the element is selected again at the index it
 * landed at. A refusal raises the toast and answers false, so the field
 * shows the stored value, and a refused text edit keeps its text for the
 * Text field.
 *
 * Edits of one frame go in order. While another session holds the frame an
 * edit waits, and one made from the hash an earlier waiting edit started
 * from is sent from the hash that one answered, so neither is lost nor sent
 * on bytes the file no longer holds. Once one was found again elsewhere, an
 * edit of an element the chain never edited goes from its own hash instead,
 * for the server to find again too. A refusal drops the edits behind it.
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
    notify = ({ copy, ...refusal }) =>
      // It leaves after Base UI's 5 s default, which hover or focus pauses.
      toast.add({
        ...refusal,
        type: 'warning',
        ...(copy === undefined
          ? {}
          : {
              actionProps: {
                children: 'Copy text',
                onClick: () => void navigator.clipboard.writeText(copy),
              },
            }),
      }),
  }: WriteDeps,
): Promise<Landed> {
  const before = prior ? await prior : undefined
  // The refused edit's toast speaks for the ones queued behind it.
  if (before === null) {
    settleRefused(selection, shownHash)
    return null
  }
  const follows = before !== undefined && before.from.includes(key.hash)
  const moved = follows ? before.at.get(key.index) : undefined
  const rebased = follows && (!before.shifted || moved !== undefined)
  const hash = rebased ? before.to : key.hash
  const index = rebased ? (moved ?? key.index) : key.index
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
          { ref: key.frame, index, hash, change },
          'POST',
          send,
        )
      } catch (error) {
        done()
        throw error
      }
    })
    const relocated = answer.from !== undefined && answer.from !== hash
    // The frame shows the agent's bytes the edit landed over until its reload.
    if (relocated && answer.from) rememberHash(key.frame, answer.from)
    rememberHash(key.frame, answer.hash)
    const { page: shownPage, frames, element: held } = selection.getState()
    // The agent's reload during the wait drops the element to its frame.
    const dropped =
      !held &&
      shownPage === page &&
      frames.length === 1 &&
      frames[0] === key.frame
    if (
      (held?.frame === key.frame &&
        (held.index === key.index || held.index === index)) ||
      (relocated && dropped)
    ) {
      selectElement(selection, page, {
        frame: key.frame,
        index: answer.index,
        hash: answer.hash,
      })
    }
    done()
    settleLanded(selection, shownHash)
    const at = new Map(follows ? before.at : [])
    at.set(key.index, answer.index)
    return {
      from: follows ? [...before.from, hash] : [key.hash],
      to: answer.hash,
      at,
      shifted: (follows && before.shifted) || relocated,
    }
  } catch (error) {
    if (!(error instanceof WaitDropped)) {
      const text = change.kind === 'text' ? change.value : undefined
      const stale =
        error instanceof BoardWriteError && error.code === 'stale-address'
      // Only a collision whose element count held leaves the index on the
      // element the text was typed for, so only then is the draft kept.
      const kept = stale && text !== undefined && error.details.moved === false
      if (kept) keptTexts.set(textKey(key), text)
      notify({
        title: 'Edit not saved',
        description:
          error instanceof BoardWriteError
            ? sentence(error.message) +
              (kept ? ' Press Enter to apply your text anyway.' : '')
            : 'The board could not be reached, so nothing was written.',
        ...(stale && text !== undefined ? { copy: text } : {}),
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

/**
 * The writer's detail, which starts lowercase for the CLI's line, as a
 * sentence. A leading file name keeps its case, as it is spelled on disk.
 */
function sentence(detail: string): string {
  const fileFirst = /^\S+\.html\b/.test(detail)
  const text = fileFirst
    ? detail
    : detail.charAt(0).toUpperCase() + detail.slice(1)
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
