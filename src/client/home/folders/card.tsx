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

/**
 * A folder's card among the projects, per `22-fix.png`: a 2x2 preview of its
 * first four members, its name, and its count. It opens the folder's panel,
 * which hands focus back to the card when it closes. Whether it is open sits
 * in the project store, so a rename that remounts the card under its new key
 * keeps the panel open. F2 or a double click on its name renames it, and a
 * right click or the ⋯ shown on hover and focus opens the folder menu.
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
        <FolderName
          folder={folder}
          calls={panel.calls}
          type="text-panel"
          unseen={unseen}
          pinned={pinned}
          editing={!open}
        />
        <span className="truncate text-body text-muted-foreground">
          {countOf(folder)}
        </span>
      </span>
    </>
  )
  if (renaming && !open) return <div className={CARD}>{body}</div>
  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <div className="group/folder relative">
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
              className={cn(CARD, 'w-full text-left')}
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
