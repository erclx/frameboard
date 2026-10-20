import { LocateOff } from 'lucide-react'
import { navigate } from 'wouter/use-browser-location'
import { createStore } from 'zustand/vanilla'

import { registerActions } from '@/client/actions/registry'
import { type LiveStore, liveStore } from '@/client/live/store'
import {
  inLandingOrder,
  type UnseenStore,
  unseenStore,
} from '@/client/live/unseen'
import { boardUrl } from '@/shared/board-urls'
import type { ListResult } from '@/shared/records/list'

import { canvasView } from '../view'

export interface FollowState {
  /** The session the board follows, null while it follows nobody. */
  session: string | null
}

/** Which session this tab follows, held in memory, so a reload stops it. */
export const followStore = createStore<FollowState>()(() => ({
  session: null,
}))

interface FollowOptions {
  live?: LiveStore
  unseen?: UnseenStore
  go?: (url: string) => void
}

let unfollow: (() => void) | null = null

/**
 * Follows a session: each frame it changes and each frame it newly claims is
 * centered at the current zoom, moving to the frame's page first when it sits
 * on another. Any view change the developer makes, opening another page, or
 * the session leaving the listeners stops it, since the board otherwise never
 * moves the view on its own.
 */
export function follow(
  session: string,
  { live = liveStore, unseen = unseenStore, go = navigate }: FollowOptions = {},
): void {
  stopFollow()
  // The page the view is on as Follow sees it, moved only by Follow's own navigation.
  let page = canvasView.page()
  let target: string | null = null

  const travel = () => {
    if (target === null) return
    const [project = '', name = ''] = target.split('/')
    const ref = pageOf(target)
    if (canvasView.page() !== ref) {
      if (page !== ref) {
        page = ref
        go(boardUrl(project, name))
      }
      return
    }
    // A new frame's change can land a batch ahead of the board holding it.
    const box = boxOf(live.getState().board, target)
    if (!box) return
    target = null
    canvasView.centerOn(box)
  }

  const head = (next: string | null) => {
    if (next === null) return
    target = next
    travel()
  }

  const stopUnseen = unseen.subscribe((state, previous) => {
    const landed = inLandingOrder(state.unseen).filter(
      (change) =>
        change.author?.session === session &&
        previous.unseen[change.frame]?.id !== change.id,
    )
    head(landed.at(-1)?.frame ?? null)
  })
  const stopLive = live.subscribe((state, previous) => {
    if (!state.listeners.some((listener) => listener.session === session)) {
      stopFollow()
      return
    }
    const claimed = Object.values(state.claims).filter(
      (claim) =>
        claim.session === session &&
        previous.claims[claim.frame]?.session !== session,
    )
    if (claimed.length > 0) head(claimed.at(-1)?.frame ?? null)
    else if (state.board !== previous.board) travel()
  })
  const stopHand = canvasView.onHandMove(stopFollow)
  const stopAttach = canvasView.onAttach(() => {
    const attached = canvasView.page()
    if (attached === null) return
    // Show, Next, and the `show` message set `focus` before they navigate,
    // so a page holding the focused frame is the board's move, not a hand pick.
    const focus = live.getState().focus
    if (focus !== null && attached === pageOf(focus)) page = attached
    if (attached !== page) {
      stopFollow()
      return
    }
    travel()
  })
  const unregister = registerActions([
    {
      id: 'follow.stop',
      label: 'Stop following',
      group: 'changes',
      run: stopFollow,
      command: { label: 'Stop following the agent', icon: LocateOff },
    },
  ])

  unfollow = () => {
    unregister()
    stopAttach()
    stopHand()
    stopLive()
    stopUnseen()
  }
  followStore.setState({ session })
}

/** Stops following, leaving the view where it is. */
export function stopFollow(): void {
  if (!unfollow) return
  const stop = unfollow
  unfollow = null
  stop()
  followStore.setState({ session: null })
}

function pageOf(ref: string): string {
  const [project = '', page = ''] = ref.split('/')
  return `${project}/${page}`
}

function boxOf(board: ListResult | null, ref: string) {
  for (const project of board?.projects ?? []) {
    for (const page of project.pages) {
      const frame = page.frames.find((candidate) => candidate.ref === ref)
      if (frame) return frame.box
    }
  }
  return null
}
