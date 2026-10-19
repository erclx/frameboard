import { Redo2, Undo2 } from 'lucide-react'
import { navigate as browserNavigate } from 'wouter/use-browser-location'

import {
  type Action,
  refreshActions,
  registerActions,
} from '@/client/actions/registry'
import { dropPending } from '@/client/board/geometry/write'
import { shownHash } from '@/client/board/inspector/element/write'
import {
  awaitHash,
  rememberHash,
  selectElement,
  type SelectionStore,
  selectionStore,
  settleLanded,
  settleRefused,
} from '@/client/board/selection'
import { toast } from '@/client/components/ui/toast'
import { type LiveStore, liveStore } from '@/client/live/store'
import { type StepAnswer, structure } from '@/client/live/structure'
import { BoardWriteError } from '@/client/live/write'
import { boardUrl } from '@/shared/board-urls'

export interface HistoryDeps {
  store?: LiveStore
  /** The undo and redo calls, which the server answers. */
  calls?: Pick<typeof structure, 'undo' | 'redo'>
  navigate?: (to: string) => void
  selection?: SelectionStore
  /** Shows a refusal, the kit's toast by default. */
  notify?: (refusal: { title: string; description: string }) => void
}

/**
 * Registers `edit.undo` on Cmd+Z and `edit.redo` on Cmd+Shift+Z, which the
 * toolbar draws, each lit while the tab may write and the server holds a
 * step. A step that renamed, added, or removed a page answers the page to
 * show, which the board follows, a hand edit answers its frame's hash, which
 * keeps the selected element, and a refused step raises a toast. Returns
 * the function that removes them.
 */
export function registerHistoryActions({
  store = liveStore,
  calls = structure,
  navigate = browserNavigate,
  selection = selectionStore,
  notify = (refusal) =>
    // A refusal is the only record that the step was dropped, so it stays until dismissed.
    toast.add({ ...refusal, type: 'warning', timeout: 0 }),
}: HistoryDeps = {}): () => void {
  const follow = (answer: StepAnswer) => {
    dropPending(answer.frames)
    // An undone hand edit leaves the element where it was, so the selection
    // takes the restored hash before the reload would drop it to the frame.
    for (const [ref, written] of Object.entries(answer.hashes ?? {})) {
      rememberHash(ref, written)
    }
    const held = selection.getState()
    const hash = held.element ? answer.hashes?.[held.element.frame] : undefined
    if (held.page && held.element && hash) {
      selectElement(selection, held.page, { ...held.element, hash })
    }
    if (answer.page === null) return
    const [project = '', page = ''] = answer.page.split('/')
    navigate(boardUrl(project, page))
  }
  const step = (run: () => Promise<StepAnswer>, title: string) => () => {
    // An undo can rewrite any frame, whose reload may land before the answer names its hash.
    const done = awaitHash(null)
    run().then(
      (answer) => {
        done()
        follow(answer)
        settleLanded(selection, shownHash)
      },
      (error: unknown) => {
        done()
        settleRefused(selection, shownHash)
        // An empty stack is the one refusal with nothing to say, since the key is unlit then.
        if (
          error instanceof BoardWriteError &&
          error.code !== 'nothing-to-undo'
        ) {
          notify({ title, description: error.message })
        }
      },
    )
  }
  const can = (count: 'undo' | 'redo') => () => {
    const { canWrite, history } = store.getState()
    return canWrite && history[count] > 0
  }
  const actions: Action[] = [
    {
      id: 'edit.undo',
      label: 'Undo',
      group: 'edit',
      keys: ['$mod+KeyZ'],
      run: step(calls.undo, 'Undo skipped'),
      enabled: can('undo'),
      command: { label: 'Undo', icon: Undo2 },
    },
    {
      id: 'edit.redo',
      label: 'Redo',
      group: 'edit',
      keys: ['$mod+Shift+KeyZ'],
      run: step(calls.redo, 'Redo skipped'),
      enabled: can('redo'),
      command: { label: 'Redo', icon: Redo2 },
    },
  ]
  const unregister = registerActions(actions)
  const unsubscribe = store.subscribe((state, previous) => {
    if (
      state.history !== previous.history ||
      state.canWrite !== previous.canWrite
    ) {
      refreshActions()
    }
  })
  return () => {
    unsubscribe()
    unregister()
  }
}
