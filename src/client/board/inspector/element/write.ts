import { toast } from '@/client/components/ui/toast'
import { BoardWriteError, writeBoard } from '@/client/live/write'
import type { EditResult } from '@/shared/records/edit'

import { WaitDropped, whenFree } from '../../claims/waiting'
import { catchUpTree, trees } from '../../element/tree'
import { renderedHash } from '../../frame-dom'
import {
  awaitHash,
  type ElementKey,
  rememberHash,
  selectedElements,
  selectElement,
  selectElements,
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
  /** Drops the attribute, since an empty value still states a boolean one. */
  | { kind: 'attribute'; name: string; remove: true }
  | { kind: 'text'; value: string }
  /** Several declarations written as one edit, which one undo puts back. */
  | {
      kind: 'styles'
      declarations: readonly { property: string; value: string }[]
    }

/** One element's change in a batch, all of one frame at one hash. */
export interface ElementEdit {
  key: ElementKey
  change: ElementChange
}

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
  /** Brings the frame's element tree up to the bytes an edit answered, `catchUpHeldTree` by default. */
  catchUp?: (ref: string, hash: string) => Promise<void>
}

/**
 * Brings a frame's element tree up to `hash` when the board holds one, since
 * a Layers row keys a write off that tree. A frame whose tree nobody asked
 * for is left alone.
 */
function catchUpHeldTree(ref: string, hash: string): Promise<void> {
  return trees.store.getState().byRef[ref]
    ? catchUpTree(ref, hash)
    : Promise.resolve()
}

/**
 * The hashes an element edit's chain went from and to, null when it was not
 * written. `at` maps each element index the chain edited, as its edits were
 * made, to where it now sits, and `shifted` says whether any was found again
 * past an agent's write, after which an index the chain never edited may
 * name another element. `moves`, which only a sibling move writes, maps
 * each `hash\nindex` an element the chain moved was addressed at to where it
 * now sits, since a key pressed between two moves names a middle hash.
 */
export type Landed = {
  from: readonly string[]
  to: string
  at: ReadonlyMap<number, number>
  shifted: boolean
  moves?: ReadonlyMap<string, number>
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
  return inFrameTurn(key.frame, (prior) =>
    editInTurn(prior, page, key, change, deps),
  ).then((landed) => landed !== null)
}

/**
 * Writes these changes, all to elements of one frame at one hash, as one write
 * and one undo step, in that frame's turn as `writeElement` does one, refused
 * whole. Every selected element stays selected at the hash answered, and one
 * the batch left alone is dropped once the server found the others elsewhere,
 * since its index may then name another element.
 */
export function writeElements(
  page: string,
  edits: readonly ElementEdit[],
  deps: WriteDeps = {},
): Promise<boolean> {
  const [first] = edits
  if (!first) return Promise.resolve(false)
  return inFrameTurn(first.key.frame, (prior) =>
    batchInTurn(prior, page, first.key, edits, deps),
  ).then((landed) => landed !== null)
}

/**
 * Runs one write of `frame`'s file behind the element edits and inserts
 * already queued on it, handing it what the one before it landed, so a
 * write made from the hash that one started from is sent from the hash it
 * answered, or not at all once it was refused.
 *
 * A turn stays the frame's latest until its write settles, and an element
 * edit settles only once the frame's element tree holds the bytes it
 * answered. A Layers row keys a move off that tree, so a move pressed from
 * the tree before then is queued behind the edit and follows it, and one
 * pressed after reads the answered bytes itself.
 */
export function inFrameTurn(
  frame: string,
  write: (prior: Promise<Landed> | undefined) => Promise<Landed>,
): Promise<Landed> {
  const turn = write(queues.get(frame))
  queues.set(frame, turn)
  return turn.finally(() => {
    if (queues.get(frame) === turn) queues.delete(frame)
  })
}

function showRefusal({ copy, ...refusal }: Refusal): void {
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
  })
}

async function batchInTurn(
  prior: Promise<Landed> | undefined,
  page: string,
  { frame, hash: read }: ElementKey,
  edits: readonly ElementEdit[],
  {
    selection = selectionStore,
    send = fetch,
    notify = showRefusal,
    catchUp = catchUpHeldTree,
  }: WriteDeps,
): Promise<Landed> {
  const before = prior ? await prior : undefined
  if (before === null) {
    settleRefused(selection, shownHash)
    return null
  }
  const follows = before !== undefined && before.from.includes(read)
  const rebased =
    follows &&
    (!before.shifted || edits.every(({ key }) => before.at.has(key.index)))
  const hash = rebased ? before.to : read
  const sent = edits.map(({ key, change }) => ({
    index: rebased ? (before.at.get(key.index) ?? key.index) : key.index,
    change,
  }))
  let done = () => {}
  try {
    const answer = await whenFree([frame], 'edit', async () => {
      done = awaitHash(frame)
      rememberHash(frame, hash)
      try {
        return await writeBoard<EditResult>(
          '/api/frames/edit',
          { ref: frame, hash, edits: sent },
          'POST',
          send,
        )
      } catch (error) {
        done()
        throw error
      }
    })
    const relocated = answer.from !== undefined && answer.from !== hash
    if (relocated && answer.from) rememberHash(frame, answer.from)
    rememberHash(frame, answer.hash)
    const landedAt = new Map(
      edits.map(({ key }, at) => [
        key.index,
        answer.indexes?.[at] ?? sent[at]?.index ?? key.index,
      ]),
    )
    const state = selection.getState()
    if (state.page === page && state.frames.includes(frame)) {
      const held = selectedElements(state)
      const named = held.length > 0 ? held : edits.map(({ key }) => key)
      if (held.length > 0 || relocated) {
        selectElements(
          selection,
          page,
          named.flatMap((key) => {
            const index = landedAt.get(key.index)
            if (index === undefined && relocated) return []
            return [{ frame, index: index ?? key.index, hash: answer.hash }]
          }),
        )
      }
    }
    done()
    settleLanded(selection, shownHash)
    await catchUp(frame, answer.hash)
    const at = new Map(follows ? before.at : [])
    for (const [from, to] of landedAt) at.set(from, to)
    return {
      from: follows ? [...before.from, hash] : [read],
      to: answer.hash,
      at,
      shifted: (follows && before.shifted) || relocated,
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

async function editInTurn(
  prior: Promise<Landed> | undefined,
  page: string,
  key: ElementKey,
  change: ElementChange,
  {
    selection = selectionStore,
    send = fetch,
    notify = showRefusal,
    catchUp = catchUpHeldTree,
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
    await catchUp(key.frame, answer.hash)
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
export function sentence(detail: string): string {
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
