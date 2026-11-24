import { useRoute } from 'wouter'

import { useMode } from '@/client/board/mode'
import { cn } from '@/client/lib/cn'

import {
  EditAccessButton,
  EditAccessDialog,
  type EditAccessProps,
} from './edit-access'
import { useEditOffered, useViewOnly } from './view-only'

/**
 * The View only pill in the slot the Reconnecting pill holds, which never
 * shows at the same time since this one waits on a connected socket. Play
 * hides it on the board, where its banner holds that spot and nothing edits,
 * though the inspector's button still opens the dialog there.
 */
export function ViewOnlyNotice(props: EditAccessProps) {
  const viewOnly = useViewOnly()
  const editOffered = useEditOffered()
  const [onBoard] = useRoute('/p/*')
  const playing = useMode((state) => state.mode === 'play')
  const shown = viewOnly && !(onBoard && playing)
  return (
    <>
      {shown ? (
        <p
          role="status"
          data-view-only-notice
          className={cn(
            'absolute top-3 left-1/2 -translate-x-1/2 rounded-xl border border-border bg-card text-body text-muted-foreground',
            editOffered
              ? 'flex items-center gap-2 py-1 pr-1 pl-3 whitespace-nowrap'
              : 'px-3 py-1',
          )}
        >
          {editOffered ? (
            <>
              View only
              <EditAccessButton />
            </>
          ) : (
            'View only. Run frameboard open to edit'
          )}
        </p>
      ) : null}
      <EditAccessDialog {...props} />
    </>
  )
}
