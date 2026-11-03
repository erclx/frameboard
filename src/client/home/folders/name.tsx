import { cn } from 'cn'

import { RenameField } from '@/client/components/rename-field'
import { UnseenCount } from '@/client/components/unseen-count'
import type { Structure } from '@/client/live/structure'
import {
  renameFolder,
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
  className?: string
}

/**
 * A folder's name, or the field renaming it with the reason its last name
 * was refused, in the name's own line box so the card or row keeps its height.
 */
export function FolderName({
  folder,
  calls,
  type,
  unseen,
  editing = true,
  className,
}: FolderNameProps) {
  const renaming = useRenamingFolder(folder.key)
  if (!renaming || !editing) {
    return (
      <span className={cn('flex min-w-0 items-center gap-1.5', className)}>
        <span className={cn('truncate', type)} title={folder.name}>
          {folder.name}
        </span>
        <span className="ml-auto flex items-center gap-1.5">
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
