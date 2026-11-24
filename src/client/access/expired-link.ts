import { toast } from '@/client/components/ui/toast'
import { type LiveStore, liveStore } from '@/client/live/store'

import { askToEdit } from './edit-store'

/** The query the server's redeem route lands a failed ticket on. */
const FLAG = 'link'
const EXPIRED = 'expired'

/**
 * Watches for a landing from a dead redeem link, stripping the flag only once
 * access answers, so a watch stopped early leaves it for the next one.
 */
export function watchExpiredLink(
  store: LiveStore = liveStore,
  notify: (editButton: boolean) => void = toastExpired,
): () => void {
  if (new URLSearchParams(location.search).get(FLAG) !== EXPIRED) {
    return () => {}
  }
  const settle = (): boolean => {
    const { accessKnown, canWrite, editButton } = store.getState()
    if (!accessKnown) return false
    const url = new URL(location.href)
    url.searchParams.delete(FLAG)
    history.replaceState(history.state, '', url)
    if (!canWrite) notify(editButton)
    return true
  }
  if (settle()) return () => {}
  const unsubscribe = store.subscribe(() => {
    if (settle()) unsubscribe()
  })
  return unsubscribe
}

const LINK = 'A link works once, for a short time.'
const RUN_OPEN = `${LINK} Run frameboard open for a new one.`

export function toastExpired(editButton: boolean): void {
  const id = toast.add({
    title: 'This edit link has expired',
    description: editButton ? LINK : RUN_OPEN,
    type: 'warning',
    timeout: 0,
    ...(editButton
      ? {
          actionProps: {
            children: 'Edit this board',
            onClick: () => {
              // The toast outlives the socket, and so the offer it was raised under.
              if (!liveStore.getState().editButton) {
                toast.update(id, {
                  description: RUN_OPEN,
                  actionProps: undefined,
                })
                return
              }
              toast.close(id)
              askToEdit()
            },
          },
        }
      : {}),
  })
}
