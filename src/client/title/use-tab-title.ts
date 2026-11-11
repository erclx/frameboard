import { useEffect } from 'react'
import { useRoute } from 'wouter'

import { useLive } from '@/client/live/store'
import { unseenReplies, useUnseen } from '@/client/live/unseen'

/** The title `index.html` ships and the tab reads with nothing to count. */
export const APP_TITLE = 'Frameboard'

/**
 * The tab title, per tab-count-720: the open project's name before the app's,
 * led by the count of unseen agent work when there is any.
 */
export function tabTitle(count: number, project: string | null): string {
  const named = project === null ? APP_TITLE : `${project} · ${APP_TITLE}`
  return count > 0 ? `(${count}) ${named}` : named
}

/**
 * Keeps `document.title` on the count of every unseen agent change and agent
 * note reply on the board, whichever project is open, since the toast and
 * its Mark all seen span the whole board too.
 */
export function useTabTitle(): void {
  const [onProject, params] = useRoute<{ project: string }>(
    '/p/:project/:page?',
  )
  const changes = useUnseen((state) => Object.keys(state.unseen).length)
  const seenReplies = useUnseen((state) => state.replies)
  const replies = useLive((state) => unseenReplies(state.notes, seenReplies))
  const title = tabTitle(changes + replies, onProject ? params.project : null)
  useEffect(() => {
    document.title = title
  }, [title])
  useEffect(
    () => () => {
      document.title = APP_TITLE
    },
    [],
  )
}
