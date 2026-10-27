import { useRoute } from 'wouter'

import { useMode } from '@/client/board/mode'

import { useViewOnly } from './view-only'

/**
 * The View only pill in the slot the Reconnecting pill holds, which never
 * shows at the same time since this one waits on a connected socket. Play
 * hides it on the board, where its banner holds that spot and nothing edits.
 */
export function ViewOnlyNotice() {
  const viewOnly = useViewOnly()
  const [onBoard] = useRoute('/p/*')
  const playing = useMode((state) => state.mode === 'play')
  if (!viewOnly || (onBoard && playing)) return null
  return (
    <p
      role="status"
      data-view-only-notice
      className="absolute top-3 left-1/2 -translate-x-1/2 rounded-xl border border-border bg-card px-3 py-1 text-body text-muted-foreground"
    >
      View only. Run frameboard open to edit
    </p>
  )
}
