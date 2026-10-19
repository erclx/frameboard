import { ArrowRight, ScanEye } from 'lucide-react'
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
  nextUnseen,
  pointAt,
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
 * Registers Show and Next, with `]` for Next, while the board is mounted.
 * Next steps through the changes in the order they landed, wrapping, and
 * shows each, since the view moves only because the developer asked.
 */
export function useChangeActions(
  store: UnseenStore = unseenStore,
  go: (url: string) => void = navigate,
): void {
  useEffect(() => {
    const unseenAny = () => Object.keys(store.getState().unseen).length > 0
    const actions: Action[] = [
      {
        id: 'changes.show',
        label: 'Show change',
        group: 'changes',
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
        run: () => {
          // From the change the toast shows, so Next always moves past what it reads.
          const next = nextUnseen(
            store.getState().unseen,
            currentChange(store)?.frame ?? null,
          )
          if (!next) return
          pointAt(store, next.frame)
          showChange(next.frame, go)
        },
        enabled: unseenAny,
        command: { label: 'Next agent change', icon: ArrowRight },
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
