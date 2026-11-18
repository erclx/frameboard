import { Redo2, Undo2 } from 'lucide-react'
import { navigate as browserNavigate } from 'wouter/use-browser-location'

import { IS_MAC } from '@/client/actions/keys'
import {
  type Action,
  refreshActions,
  registerActions,
} from '@/client/actions/registry'
import { type EditLabel, whenFree } from '@/client/board/claims/waiting'
import { catchUpTree, readTree } from '@/client/board/element/tree'
import { dropPending } from '@/client/board/geometry/write'
import { shownHash } from '@/client/board/inspector/element/write'
import {
  awaitHash,
  rememberHash,
  select,
  selectedElements,
  selectElements,
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
import type { ElementTree } from '@/shared/records/elements'

export interface HistoryDeps {
  store?: LiveStore
  /** The undo and redo calls, which the server answers. */
  calls?: Pick<typeof structure, 'undo' | 'redo'>
  navigate?: (to: string) => void
  selection?: SelectionStore
  /** Shows a refusal, the kit's toast by default. */
  notify?: (refusal: { title: string; description: string }) => void
  /** Whether the board runs on a Mac, where Ctrl+Y is not redo. */
  mac?: boolean
  /** A frame's element tree once it shows the bytes at `hash`, null when those bytes cannot be read. */
  treeAt?: (ref: string, hash: string) => Promise<ElementTree | null>
}

/**
 * Whether the picked index still names the picked element, since a placement,
 * delete, or move shifts indices.
 */
function keepsElement(
  before: ElementTree,
  after: ElementTree,
  index: number,
): boolean {
  if (before.elements.length !== after.elements.length) return false
  return (
    before.elements.every((was, at) => {
      const now = after.elements[at]
      return (
        now !== undefined &&
        now.index === was.index &&
        now.parent === was.parent &&
        now.tag === was.tag &&
        (was.index === index || now.name === was.name)
      )
    }) && after.elements.some((now) => now.index === index)
  )
}

/**
 * Registers undo and redo, a hand edit keeping the selected element while the
 * frame's new tree still holds it.
 */
export function registerHistoryActions({
  store = liveStore,
  calls = structure,
  navigate = browserNavigate,
  selection = selectionStore,
  notify = (refusal) =>
    // It leaves after Base UI's 5 s default, which hover or focus pauses.
    toast.add({ ...refusal, type: 'warning' }),
  mac = IS_MAC,
  treeAt = async (ref, hash) => {
    await catchUpTree(ref, hash)
    // The frame's reload can land meanwhile, whose own fetch holds the tree then.
    const tree = await readTree(ref)
    return tree?.hash === hash ? tree : null
  },
}: HistoryDeps = {}): () => void {
  const follow = (answer: StepAnswer, before: ElementTree | null) => {
    dropPending(answer.frames)
    // Keeps the element through the reload until the check below settles it.
    for (const [ref, written] of Object.entries(answer.hashes ?? {})) {
      rememberHash(ref, written)
    }
    const { page: shown, element } = selection.getState()
    const hash = element ? answer.hashes?.[element.frame] : undefined
    if (shown && element && hash) {
      // Only while the new tree holds it, since an undone placement shifts elements.
      void treeAt(element.frame, hash).then((after) => {
        if (selection.getState().element !== element) return
        if (
          before?.hash === element.hash &&
          after &&
          keepsElement(before, after, element.index)
        ) {
          const kept = selectedElements(selection.getState()).filter(
            ({ index }) =>
              index === element.index || keepsElement(before, after, index),
          )
          selectElements(
            selection,
            shown,
            kept.map((key) => ({ ...key, hash })),
          )
        } else {
          select(selection, shown, [element.frame])
        }
      })
    }
    if (answer.page === null) return
    const [project = '', page = ''] = answer.page.split('/')
    navigate(boardUrl(project, page))
  }
  // One step out at a time, a repeat dropped and one press slotted, so a held key overshoots once.
  let out = false
  let queued: (() => void) | null = null
  // Waits only once refused as claimed, since the board cannot name its frames.
  const step = (
    run: () => Promise<StepAnswer>,
    title: string,
    label: EditLabel,
  ) => {
    const start = () => {
      out = true
      let done = () => {}
      // Read before the step rewrites the bytes the answer is checked against.
      let before: ElementTree | null = null
      // A step landing during the wait would be the one a bare undo takes, so it ends the wait.
      const counts = store.getState().history
      const moved = ({ history }: { history: typeof counts }) =>
        history.undo !== counts.undo || history.redo !== counts.redo
      whenFree(
        [],
        label,
        async () => {
          // An undo can rewrite any frame, whose reload may land before the answer names its hash.
          done = awaitHash(null)
          const picked = selection.getState().element
          before = picked ? await treeAt(picked.frame, picked.hash) : null
          return run().catch((error: unknown) => {
            done()
            throw error
          })
        },
        { live: store, dropWhen: moved },
      ).then(
        (answer) => {
          out = false
          done()
          follow(answer, before)
          settleLanded(selection, shownHash)
          const next = queued
          queued = null
          next?.()
        },
        (error: unknown) => {
          out = false
          queued = null
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
    return (trigger?: { repeat: boolean }) => {
      if (!out) start()
      else if (!trigger?.repeat) queued = start
    }
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
      repeat: true,
      run: step(calls.undo, 'Undo skipped', 'undo'),
      enabled: can('undo'),
      command: { label: 'Undo', icon: Undo2 },
    },
    {
      id: 'edit.redo',
      label: 'Redo',
      group: 'edit',
      keys: mac ? ['$mod+Shift+KeyZ'] : ['$mod+Shift+KeyZ', 'Control+KeyY'],
      repeat: true,
      run: step(calls.redo, 'Redo skipped', 'redo'),
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
