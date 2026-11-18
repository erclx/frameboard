import { type RefObject, useEffect, useState } from 'react'

/** A load sooner than this draws no block, since its flash costs more than the wait. */
const LOADING_BLOCK_DELAY_MS = 1000

type FirstLoad = 'early' | 'waiting' | 'painted'

/**
 * Whether a live iframe is still waiting on its first page past the delay.
 * A reload of a painted frame keeps the old page showing, so only a new
 * iframe, mounted on going live, waits again.
 */
export function useWaitingOnFirstLoad(
  iframe: RefObject<HTMLIFrameElement | null>,
  live: boolean,
): boolean {
  const [state, setState] = useState<{ live: boolean; load: FirstLoad }>({
    live,
    load: 'early',
  })
  if (state.live !== live) setState({ live, load: 'early' })
  useEffect(() => {
    const element = iframe.current
    if (!live || !element) return
    const timer = setTimeout(() => {
      setState((current) =>
        current.load === 'early' ? { live, load: 'waiting' } : current,
      )
    }, LOADING_BLOCK_DELAY_MS)
    const paint = () => {
      clearTimeout(timer)
      setState({ live, load: 'painted' })
    }
    element.addEventListener('load', paint, { once: true })
    return () => {
      clearTimeout(timer)
      element.removeEventListener('load', paint)
    }
  }, [iframe, live])
  return live && state.load === 'waiting'
}
