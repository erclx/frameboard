import { navigate } from 'wouter/use-browser-location'

import { toast as kitToasts } from '@/client/components/ui/toast'
import { type LiveStore, liveStore } from '@/client/live/store'
import { boardUrl } from '@/shared/board-urls'

import { canvasView } from '../view'
import { type Busy, watchBusy } from './busy'
import { followStore } from './follow'

/** The `type` the kit's stack draws `ShowOfferBody` for. */
export const SHOW_OFFER = 'show-offer'

/** What the offer says about the frame an agent pointed at. */
export interface OfferCopy {
  ref: string
  title: string
  detail: string
}

type Toasts = Pick<typeof kitToasts, 'add' | 'close'>

export interface ShowDeps {
  live: LiveStore
  busy: () => Busy
  toasts: Toasts
  go: (url: string) => void
  /** Whether this tab follows a session, read at each decision. */
  following: () => boolean
  /** The project the board shows now, null on the home view. */
  project: () => string | null
}

const defaults: ShowDeps = {
  live: liveStore,
  busy: startBusyWatch,
  toasts: kitToasts,
  go: navigate,
  following: () => followStore.getState().session !== null,
  project: () => /^\/p\/([^/]+)/.exec(location.pathname)?.[1] ?? null,
}

let cancelWait: (() => void) | null = null
let closeOffer: (() => void) | null = null

/**
 * Decides what a `show` message does in this tab. An idle board jumps to the
 * frame, and a developer mid-action is never pulled away: a tab following a
 * session waits for the last busy signal to clear, and any other offers the
 * jump as a toast. A show that would change project is only taken while
 * following. The newest show replaces a waiting one and an open offer.
 */
export function receiveShow(ref: string, deps: ShowDeps = defaults): void {
  supersede()
  decide(ref, deps)
}

/** Brings the frame into view, moving to its page first, as the canvas of that page then zooms to it. */
export function jumpTo(
  ref: string,
  { go, live }: Pick<ShowDeps, 'go' | 'live'> = defaults,
): void {
  const [project = '', page = ''] = ref.split('/')
  // The page route first, then the canvas it mounts zooms to the frame.
  go(boardUrl(project, page))
  live.setState({ focus: ref })
}

/** What the offer's Go does: the jump, and the offer closed with it. */
export function acceptOffer(
  ref: string,
  deps: Pick<ShowDeps, 'go' | 'live'> = defaults,
): void {
  jumpTo(ref, deps)
  closeOffer?.()
}

/** The words of the offer for a frame ref. */
export function offerCopy(ref: string): OfferCopy {
  const [project = '', page = '', frame = ''] = ref.split('/')
  return {
    ref,
    title: `An agent showed ${frame}`,
    detail: `${page} in ${project}`,
  }
}

function decide(ref: string, deps: ShowDeps): void {
  const [project = ''] = ref.split('/')
  const following = deps.following()
  if (project !== deps.project() && !following) return offer(ref, deps)
  if (!deps.busy().busy()) return jumpTo(ref, deps)
  if (!following) return offer(ref, deps)
  // Follow is read again when the wait ends, since a hand move ends it.
  cancelWait = deps.busy().whenIdle(() => {
    cancelWait = null
    decide(ref, deps)
  })
}

function offer(ref: string, deps: ShowDeps): void {
  const [project = '', page = ''] = ref.split('/')
  const id = deps.toasts.add({
    type: SHOW_OFFER,
    timeout: 0,
    data: offerCopy(ref),
    onClose: () => {
      stopWatching()
      if (closeOffer === close) closeOffer = null
    },
  })
  const close = () => deps.toasts.close(id)
  // The developer reaching the page unaided makes the offer moot.
  const stopWatching = canvasView.onAttach(() => {
    if (canvasView.page() === `${project}/${page}`) close()
  })
  closeOffer = close
}

let shared: Busy | null = null

/**
 * Starts the one busy watch, which the app calls before the socket connects
 * so a press held before the first show is already on the record.
 */
export function startBusyWatch(): Busy {
  return (shared ??= watchBusy())
}

/** Drops a show still waiting for the developer, as a dropped socket does. */
export function cancelPendingShow(): void {
  cancelWait?.()
  cancelWait = null
}

function supersede(): void {
  cancelPendingShow()
  closeOffer?.()
}
