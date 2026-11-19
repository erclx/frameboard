import { Folder } from 'lucide-react'
import type { KeyboardEvent } from 'react'
import { useStore } from 'zustand'

import { Dialog, DialogTrigger } from '@/client/components/ui/dialog'
import { cn } from '@/client/lib/cn'
import {
  focusFolder,
  projectStore,
  useRenamingFolder,
} from '@/client/projects/actions'

import { type Captures, CARD } from '../project-card'
import { runFolderKey } from '../rove'
import { FrameSkeleton } from '../skeleton'
import { countOf } from './entries'
import { FolderMenu, FolderMore } from './menu'
import { FolderName } from './name'
import { FolderPanel, type PanelProps } from './panel'
import { useTitleClick } from './title-click'

interface FolderCardProps extends PanelProps {
  /** The one card the tab sequence holds, the focused one or else the first. */
  tabbable: boolean
  /** How many frames an agent changed unseen across every member. */
  unseen: number
  /** Whether this browser pinned the folder. */
  pinned: boolean
  captures: Captures
}

/** The card's frame with its top left corner squared, where the tab meets it. */
const FOLDER_CARD = cn(
  CARD,
  'rounded-tl-none group-hover/folder:ring-2 group-hover/folder:ring-primary',
)

/**
 * Per `folder-tab-one-shape-720`, its fill runs 4px into the card on `after:`, not a taller box that would carry the side lines in,
 * so the ring stays covered at a fractional display scale. At rest the fill stops short of the right line to keep the foot's corner.
 */
const FOLDER_TAB =
  'pointer-events-none absolute -top-[9px] left-0 z-10 h-2.5 w-[74px] rounded-tl-[7px] rounded-tr-[9px] bg-card after:absolute after:top-[9px] after:right-px after:left-px after:h-[5px] after:bg-card group-hover/folder:after:right-0 group-has-focus-visible/folder:after:right-0 group-has-data-popup-open/folder:after:right-0 in-data-drop-over:after:right-0 shadow-[inset_0_1px_0_0_var(--color-border),inset_1px_0_0_0_var(--color-border),inset_-1px_0_0_0_var(--color-border)] group-hover/folder:shadow-[0_-2px_0_0_var(--color-primary),-2px_0_0_0_var(--color-primary),2px_0_0_0_var(--color-primary)] group-has-focus-visible/folder:shadow-[0_-2px_0_0_var(--color-primary),-2px_0_0_0_var(--color-primary),2px_0_0_0_var(--color-primary)] group-has-data-popup-open/folder:shadow-[0_-2px_0_0_var(--color-primary),-2px_0_0_0_var(--color-primary),2px_0_0_0_var(--color-primary)] in-data-drop-over:shadow-[0_-2px_0_0_var(--color-primary),-2px_0_0_0_var(--color-primary),2px_0_0_0_var(--color-primary)]'

/**
 * A folder's card per `22-fix.png`, its open state held in the project store,
 * so a rename that remounts the card under its new key keeps the panel open.
 */
export function FolderCard({
  folder,
  tabbable,
  unseen,
  pinned,
  ...panel
}: FolderCardProps) {
  // The old card stays open while a rename it started waits on home drawing the new key.
  const open = useStore(
    projectStore,
    (state) =>
      state.openFolder === folder.key ||
      (state.pendingRename?.from === folder.key &&
        state.openFolder === state.pendingRename.to),
  )
  const setOpen = (next: boolean) =>
    projectStore.setState({ openFolder: next ? folder.key : null })
  const renaming = useRenamingFolder(folder.key)
  const titleClick = useTitleClick(() => setOpen(true))
  const body = (
    <>
      <span
        aria-hidden
        className="m-1.5 grid h-[150px] grid-cols-2 grid-rows-2 gap-1.5 overflow-hidden rounded-lg bg-muted p-1.5"
      >
        {folder.projects.slice(0, 4).map((member) => (
          <span
            key={member.name}
            className="block overflow-hidden rounded-md bg-background p-2"
          >
            <FrameSkeleton
              project={member}
              captures={panel.captures}
              className="size-full"
            />
          </span>
        ))}
      </span>
      <span className="flex flex-col px-3 pt-1.5 pb-3">
        <span className="flex min-w-0 items-center gap-[5px]">
          <Folder
            aria-hidden
            data-folder-glyph
            className="size-[13px] shrink-0 text-muted-foreground"
          />
          <FolderName
            folder={folder}
            calls={panel.calls}
            type="text-panel"
            unseen={unseen}
            pinned={pinned}
            editing={!open}
            className="flex-1"
          />
        </span>
        <span className="truncate text-body text-muted-foreground">
          {countOf(folder)}
        </span>
      </span>
    </>
  )
  if (renaming && !open) {
    return (
      <div className="group/folder relative rounded-xl rounded-tl-none">
        <span aria-hidden className={FOLDER_TAB} />
        <div className={FOLDER_CARD}>{body}</div>
      </div>
    )
  }
  return (
    <Dialog open={open} onOpenChange={setOpen}>
      {/* The radius is the card's, since a drop over the card rings this wrapper. */}
      <div className="group/folder relative rounded-xl rounded-tl-none">
        <span aria-hidden className={FOLDER_TAB} />
        <FolderMenu
          folder={folder}
          trigger={
            <DialogTrigger
              data-project-link
              tabIndex={tabbable ? 0 : -1}
              onFocus={() => focusFolder(folder.key)}
              onClick={(event) => {
                if (titleClick(event)) event.preventBaseUIHandler()
              }}
              onKeyDown={(event: KeyboardEvent) =>
                runFolderKey(event, folder.key)
              }
              className={cn(FOLDER_CARD, 'w-full text-left')}
            >
              {body}
            </DialogTrigger>
          }
        />
        <FolderMore
          folder={folder}
          // Keyboard focus alone reveals it, since a pointer closing the menu hands focus back to the ⋯ and focus-within would pin it on.
          className="absolute top-3 right-3 opacity-0 group-hover/folder:opacity-100 group-has-focus-visible/folder:opacity-100 data-popup-open:opacity-100"
        />
      </div>
      <FolderPanel folder={folder} {...panel} />
    </Dialog>
  )
}
