import { toast } from '@/client/components/ui/toast'
import { BoardWriteError, writeBoard } from '@/client/live/write'
import type { EditResult } from '@/shared/records/edit'

import {
  type ElementKey,
  selectElement,
  type SelectionStore,
  selectionStore,
} from '../../selection'

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

/**
 * Writes one change into the element `key` names, made from the hash its
 * frame rendered, so an agent's write in between is refused as stale. The
 * answered hash goes to the selection at once, before the watcher reloads
 * the frame, which would otherwise drop the element to its frame. A refusal
 * raises the toast and answers false, so the field shows the stored value.
 */
export async function writeElement(
  page: string,
  key: ElementKey,
  change: ElementChange,
  {
    selection = selectionStore,
    send = fetch,
    notify = (refusal) =>
      // The refusal is the only record that the edit was dropped, so it stays until dismissed.
      toast.add({ ...refusal, type: 'warning', timeout: 0 }),
  }: WriteDeps = {},
): Promise<boolean> {
  try {
    const answer = await writeBoard<EditResult>(
      '/api/frames/edit',
      { ref: key.frame, index: key.index, hash: key.hash, change },
      'POST',
      send,
    )
    const held = selection.getState().element
    if (held?.frame === key.frame && held.index === key.index) {
      selectElement(selection, page, { ...key, hash: answer.hash })
    }
    return true
  } catch (error) {
    notify({
      title: 'Edit not saved',
      description:
        error instanceof BoardWriteError
          ? sentence(error.message)
          : 'The board could not be reached, so nothing was written.',
    })
    return false
  }
}

/** The writer's detail, which starts lowercase for the CLI's line, as a sentence. */
function sentence(detail: string): string {
  const text = detail.charAt(0).toUpperCase() + detail.slice(1)
  return /[.!?]$/.test(text) ? text : `${text}.`
}
