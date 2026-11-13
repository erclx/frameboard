import { Pencil, Pin } from 'lucide-react'

import { RenameField } from '@/client/components/rename-field'
import { UnseenCount } from '@/client/components/unseen-count'
import { cn } from '@/client/lib/cn'
import { useLive } from '@/client/live/store'
import type { Structure } from '@/client/live/structure'
import {
  focusFolder,
  renameFolder,
  startFolderRename,
  stopFolderRename,
  useRenamingFolder,
} from '@/client/projects/actions'

import type { HomeFolder } from './entries'

interface FolderNameProps {
  folder: HomeFolder
  calls: Structure | undefined
  /** The name's type, which the rename field takes too. */
  type: string
  /** How many frames an agent changed unseen across every member, counted after the name. */
  unseen: number
  /** Whether this place shows the rename field while the folder is being renamed. */
  editing?: boolean
  /** Whether this browser pinned the folder, marked after its name. */
  pinned?: boolean
  className?: string
}

/**
 * A folder's name, or the field renaming it with the reason its last name
 * was refused, in the name's own line box so the card or row keeps its height.
 * A double click on the name renames the folder in place while the tab may
 * write.
 */
export function FolderName({
  folder,
  calls,
  type,
  unseen,
  editing = true,
  pinned = false,
  className,
}: FolderNameProps) {
  const renaming = useRenamingFolder(folder.key)
  const canWrite = useLive((state) => state.canWrite)
  if (!renaming || !editing) {
    return (
      <span className={cn('flex min-w-0 items-center gap-1.5', className)}>
        <span
          data-folder-title
          className={cn('truncate', type)}
          title={folder.name}
          onDoubleClick={(event) => {
            if (!canWrite) return
            event.preventDefault()
            event.stopPropagation()
            startRename(folder)
          }}
        >
          {folder.name}
        </span>
        <span className="ml-auto flex items-center gap-1.5">
          {pinned ? (
            <Pin
              role="img"
              aria-label="Pinned"
              className="size-[13px] shrink-0 fill-current text-foreground"
            />
          ) : null}
          <UnseenCount count={unseen} />
        </span>
      </span>
    )
  }
  return (
    <span className={cn('flex min-w-0 flex-col', type, className)}>
      <span className="flex h-lh items-center pl-1.5">
        <RenameField
          key={renaming.attempt}
          name={renaming.draft}
          label={`Rename folder ${folder.name}`}
          onCommit={(name) => void renameFolder(folder.key, name, calls)}
          onCancel={stopFolderRename}
        />
      </span>
      {renaming.refusal ? (
        <span
          role="alert"
          className="mt-1 text-label font-normal text-destructive"
        >
          {renaming.refusal}
        </span>
      ) : null}
    </span>
  )
}

function startRename(folder: HomeFolder) {
  focusFolder(folder.key)
  startFolderRename(folder.key, folder.name)
}

/**
 * The pen beside an open folder's name, per `folder-rename-pen-720`, opening
 * the rename field in one click. It shows while the nearest `group` is hovered
 * or holds keyboard focus, or always where nothing hovers, and leaves while the field
 * is open or the tab may not write.
 */
export function FolderPen({ folder }: { folder: HomeFolder }) {
  const renaming = useRenamingFolder(folder.key)
  const canWrite = useLive((state) => state.canWrite)
  if (renaming || !canWrite) return null
  return (
    <button
      type="button"
      aria-label="Rename folder"
      title="Rename folder"
      onClick={() => startRename(folder)}
      className="-ml-1.5 grid size-6 shrink-0 place-items-center rounded-md text-muted-foreground outline-none group-has-focus-visible:opacity-100 group-hover:opacity-100 hover:bg-accent hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring/50 [@media(hover:hover)]:opacity-0"
    >
      <Pencil aria-hidden className="size-3.5" />
    </button>
  )
}
