import { navigate as browserNavigate } from 'wouter/use-browser-location'

import {
  type Action,
  refreshActions,
  registerActions,
} from '@/client/actions/registry'
import { dropPending } from '@/client/board/geometry/write'
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
  /** Shows a refusal, the kit's toast by default. */
  notify?: (refusal: { title: string; description: string }) => void
}

/**
 * Registers `edit.undo` on Cmd+Z and `edit.redo` on Cmd+Shift+Z, which the
 * toolbar draws, each lit while the tab may write and the server holds a
 * step. A step that renamed, added, or removed a page answers the page to
 * show, which the board follows, and a refused step raises a toast. Returns
 * the function that removes them.
 */
export function registerHistoryActions({
  store = liveStore,
  calls = structure,
  navigate = browserNavigate,
  notify = (refusal) =>
    // A refusal is the only record that the step was dropped, so it stays until dismissed.
    toast.add({ ...refusal, type: 'warning', timeout: 0 }),
}: HistoryDeps = {}): () => void {
  const follow = (answer: StepAnswer) => {
    dropPending(answer.frames)
    if (answer.page === null) return
    const [project = '', page = ''] = answer.page.split('/')
    navigate(boardUrl(project, page))
  }
  const step = (run: () => Promise<StepAnswer>, title: string) => () => {
    run().then(follow, (error: unknown) => {
      if (error instanceof BoardWriteError && error.code === 'undo-overtaken') {
        notify({ title, description: error.message })
      }
    })
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
    },
    {
      id: 'edit.redo',
      label: 'Redo',
      group: 'edit',
      keys: ['$mod+Shift+KeyZ'],
      run: step(calls.redo, 'Redo skipped'),
      enabled: can('redo'),
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
