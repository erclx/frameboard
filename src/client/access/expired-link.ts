import { toast } from '@/client/components/ui/toast'
import { type LiveStore, liveStore } from '@/client/live/store'

/** The query the server's redeem route lands a failed ticket on. */
const FLAG = 'link'
const EXPIRED = 'expired'

/**
 * Watches for a landing from a used, expired, or unknown redeem link. Once
 * the first access answer arrives the flag is stripped with a replace
 * navigation, and a tab that cannot write gets a toast that stays until
 * dismissed. Stripping waits on that answer, so a watch stopped early leaves
 * the flag for the next one.
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
