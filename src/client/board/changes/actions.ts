import { ArrowLeft, ArrowRight, CheckCheck, ScanEye } from 'lucide-react'
import { useEffect } from 'react'
import { navigate } from 'wouter/use-browser-location'

import {
  type Action,
  refreshActions,
  registerActions,
} from '@/client/actions/registry'
import { liveStore } from '@/client/live/store'
import {
  inLandingOrder,
  markAllSeen,
  nextUnseen,
  pointAt,
  previousUnseen,
  undoMarkAll,
  type UnseenStore,
  unseenStore,
} from '@/client/live/unseen'
import { boardUrl } from '@/shared/board-urls'
import type { FrameChange } from '@/shared/records/changes'

import { replayGlow } from './glow-store'

/** The change the toast is on, being the cursor's, or the first to land when it names none. */
export function currentChange(
  store: UnseenStore = unseenStore,
): FrameChange | null {
  const { unseen, cursor } = store.getState()
  return (
    (cursor !== null ? unseen[cursor] : undefined) ??
    inLandingOrder(unseen)[0] ??
    null
  )
}

/**
 * Brings a changed frame into view, moving to its page first when it sits
 * on another, and plays its glow again. The canvas of the frame's page
 * zooms once it holds the frame, as it does for the `show` message.
 */
export function showChange(
  ref: string,
  go: (url: string) => void = navigate,
): void {
  const [project = '', page = ''] = ref.split('/')
  const url = boardUrl(project, page)
  if (decodeURIComponent(location.pathname) !== decodeURIComponent(url)) go(url)
  liveStore.setState({ focus: ref })
  replayGlow(ref)
}

/**
 * Registers Show on `\`, Next on `]`, Previous on `[`, and Mark all seen on
 * `⇧]` while the board is mounted. Next and Previous step through the
 * changes in the order they landed, wrapping, and show each, since the view
 * moves only because the developer asked.
 */
export function useChangeActions(
  store: UnseenStore = unseenStore,
  go: (url: string) => void = navigate,
): void {
  useEffect(() => {
    const unseenAny = () => Object.keys(store.getState().unseen).length > 0
    // From the change the toast shows, so a step always moves past what it reads.
    const step = (pick: typeof nextUnseen) => () => {
      const to = pick(
        store.getState().unseen,
        currentChange(store)?.frame ?? null,
      )
      if (!to) return
      pointAt(store, to.frame)
      showChange(to.frame, go)
    }
    const actions: Action[] = [
      // First, since the palette lists in registration order and the drawn rows lead with it.
      {
        id: 'changes.markAllSeen',
        label: 'Mark all seen',
        group: 'changes',
        keys: ['Shift+BracketRight'],
        run: () => markAllSeen(store),
        enabled: unseenAny,
        command: { label: 'Mark all agent changes seen', icon: CheckCheck },
      },
      {
        id: 'changes.show',
        label: 'Show change',
        group: 'changes',
        keys: ['Backslash'],
        run: () => {
          const change = currentChange(store)
          if (!change) return
          pointAt(store, change.frame)
          showChange(change.frame, go)
        },
        enabled: unseenAny,
        command: { label: 'Show the agent change', icon: ScanEye },
      },
      {
        id: 'changes.next',
        label: 'Next change',
        group: 'changes',
        keys: ['BracketRight'],
        run: step(nextUnseen),
        enabled: unseenAny,
        command: { label: 'Next agent change', icon: ArrowRight },
      },
      {
        id: 'changes.previous',
        label: 'Previous change',
        group: 'changes',
        keys: ['BracketLeft'],
        run: step(previousUnseen),
        enabled: unseenAny,
        command: { label: 'Previous agent change', icon: ArrowLeft },
      },
      // The cleared toast's Undo alone runs it, so it carries no key or row.
      {
        id: 'changes.undoMarkAll',
        label: 'Undo mark all seen',
        group: 'changes',
        run: () => undoMarkAll(store),
        enabled: () => store.getState().lastCleared !== null,
      },
    ]
    const unregister = registerActions(actions)
    const unsubscribe = store.subscribe(refreshActions)
    return () => {
      unsubscribe()
      unregister()
    }
  }, [store, go])
}
