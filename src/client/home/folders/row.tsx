import { cn } from 'cn'
import { ChevronRight, Folder } from 'lucide-react'
import type { KeyboardEvent, ReactNode } from 'react'

import type { Structure } from '@/client/live/structure'
import { focusFolder, useRenamingFolder } from '@/client/projects/actions'

import { Edited, ROW, ROW_COLUMNS } from '../project-card'
import { runFolderKey } from '../rove'
import type { HomeFolder } from './entries'
import { FolderName } from './name'

interface FolderRowProps {
  folder: HomeFolder
  /** Whether the row shows its members under it. */
  open: boolean
  onToggle: () => void
  /** The one row the tab sequence holds, the focused one or else the first. */
  tabbable: boolean
  unseen: number
  now: number
  calls: Structure | undefined
  /** The member rows, drawn under the folder's while it is open. */
  children: ReactNode
}

/**
 * A folder's row in the list, per `22-list-fix.png`: a chevron, the folder
 * mark, its name, and its count as a pill, with Edited reading its newest
 * member. It opens and closes on a click, Enter, or Space, Right opening it
 * and Left closing it, and F2 renames it. Open, its members sit indented
 * under a guide line.
 */
export function FolderRow({
  folder,
  open,
  onToggle,
  tabbable,
  unseen,
  now,
  calls,
  children,
}: FolderRowProps) {
  const renaming = useRenamingFolder(folder.key) !== null
  const cells = (
    <>
      <span className="flex items-center gap-1 text-muted-foreground">
        <ChevronRight
          aria-hidden
          className={cn(
            'size-4 shrink-0 transition-transform motion-reduce:transition-none',
            open && 'rotate-90',
          )}
        />
        <Folder
          aria-hidden
          className="size-[22px] shrink-0"
          strokeWidth={1.6}
        />
      </span>
      <span className="flex min-w-0 items-center gap-2 pr-4">
        <FolderName
          folder={folder}
          calls={calls}
          type="font-medium"
          unseen={unseen}
          className="min-w-0 flex-1"
        />
        {renaming ? null : (
          <span className="shrink-0 rounded-full bg-muted px-[7px] text-label text-muted-foreground">
            {folder.projects.length}
            <span className="sr-only"> projects</span>
          </span>
        )}
      </span>
      <span className="hidden truncate sm:block">
        <Edited project={folder} now={now} prefix="" />
      </span>
      <span className="hidden sm:block" />
    </>
  )
  const className = cn(ROW, ROW_COLUMNS, 'w-full text-left')
  return (
    <>
      {renaming ? (
        <div className={className}>{cells}</div>
      ) : (
        <button
          type="button"
          data-project-link
          aria-expanded={open}
          tabIndex={tabbable ? 0 : -1}
          onFocus={() => focusFolder(folder.key)}
          onClick={onToggle}
          onKeyDown={(event: KeyboardEvent) => {
            if (
              (event.key === 'ArrowRight' && !open) ||
              (event.key === 'ArrowLeft' && open)
            ) {
              event.preventDefault()
              event.stopPropagation()
              onToggle()
              return
            }
            runFolderKey(event, folder.key)
          }}
          className={className}
        >
          {cells}
        </button>
      )}
      {open ? (
        <ul
          aria-label={folder.name}
          className="relative border-t border-border before:absolute before:inset-y-0 before:left-[26px] before:w-px before:bg-border"
        >
          {children}
        </ul>
      ) : null}
    </>
  )
}
