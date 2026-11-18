import { toast } from '@/client/components/ui/toast'
import { type LiveStore, liveStore } from '@/client/live/store'

/** The query the server's redeem route lands a failed ticket on. */
const FLAG = 'link'
const EXPIRED = 'expired'

/**
 * Watches for a landing from a dead redeem link, stripping the flag only once
 * access answers, so a watch stopped early leaves it for the next one.
 */
export function watchExpiredLink(
  store: LiveStore = liveStore,
  notify: () => void = toastExpired,
): () => void {
  if (new URLSearchParams(location.search).get(FLAG) !== EXPIRED) {
    return () => {}
  }
  const settle = (): boolean => {
    const { accessKnown, canWrite } = store.getState()
    if (!accessKnown) return false
    const url = new URL(location.href)
    url.searchParams.delete(FLAG)
    history.replaceState(history.state, '', url)
    if (!canWrite) notify()
    return true
  }
  if (settle()) return () => {}
  const unsubscribe = store.subscribe(() => {
    if (settle()) unsubscribe()
  })
  return unsubscribe
}

function toastExpired(): void {
  toast.add({
    title: 'This edit link has expired',
    description:
      'A link works once, for two minutes. Run frameboard open for a new one.',
    type: 'warning',
    timeout: 0,
  })
}
