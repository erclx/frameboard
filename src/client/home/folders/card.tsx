import { cn } from 'cn'
import type { KeyboardEvent } from 'react'
import { useStore } from 'zustand'

import { Dialog, DialogTrigger } from '@/client/components/ui/dialog'
import {
  focusFolder,
  projectStore,
  useRenamingFolder,
} from '@/client/projects/actions'

import { type Captures, CARD } from '../project-card'
import { runFolderKey } from '../rove'
import { FrameSkeleton } from '../skeleton'
import { countOf } from './entries'
import { FolderName } from './name'
import { FolderPanel, type PanelProps } from './panel'

interface FolderCardProps extends PanelProps {
  /** The one card the tab sequence holds, the focused one or else the first. */
  tabbable: boolean
  /** How many frames an agent changed unseen across every member. */
  unseen: number
  captures: Captures
}

/**
 * A folder's card among the projects, per `22-fix.png`: a 2x2 preview of its
 * first four members, its name, and its count. It opens the folder's panel,
 * which hands focus back to the card when it closes. Whether it is open sits
 * in the project store, so a rename that remounts the card under its new key
 * keeps the panel open. F2 renames it.
 */
export function FolderCard({
  folder,
  tabbable,
  unseen,
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
      <DialogTrigger
        data-project-link
        tabIndex={tabbable ? 0 : -1}
        onFocus={() => focusFolder(folder.key)}
        onKeyDown={(event: KeyboardEvent) => runFolderKey(event, folder.key)}
        className={cn(CARD, 'w-full text-left')}
      >
        {body}
      </DialogTrigger>
      <FolderPanel folder={folder} {...panel} />
    </Dialog>
  )
}
