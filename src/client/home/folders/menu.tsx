import { Ellipsis } from 'lucide-react'
import { type ReactElement, type ReactNode, useRef } from 'react'

import { type Action, isEnabled, useActions } from '@/client/actions/registry'
import { useKeyboardOpen } from '@/client/components/menu-keyboard'
import {
  ContextMenu,
  ContextMenuContent,
  ContextMenuGroup,
  ContextMenuItem,
  ContextMenuLabel,
  ContextMenuSeparator,
  ContextMenuShortcut,
  ContextMenuTrigger,
} from '@/client/components/ui/context-menu'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuTrigger,
} from '@/client/components/ui/dropdown-menu'
import { cn } from '@/client/lib/cn'
import { focusFolder } from '@/client/projects/actions'

import type { HomeFolder } from './entries'

const IDS = [
  'folder.open',
  'folder.rename',
  'folder.ungroup',
  'folder.pin',
] as const

interface FolderMenuProps {
  folder: HomeFolder
  /** The card or row the menu opens on, which keeps focus when it closes. */
  trigger: ReactElement
  /** Opens the folder in place of `folder.open`, as a list row does by expanding. */
  onOpen?: () => void
}

/**
 * The right-click menu of a folder's card or row, per
 * `folders-menu-inline-720`: Open, Rename, Ungroup, and Pin running the
 * `folder.*` actions on the folder it opened from, Pin reading Unpin on a
 * pinned one. The menu key and Shift+F10 open it too, with focus on its
 * first item.
 */
export function FolderMenu({ folder, trigger, onOpen }: FolderMenuProps) {
  const content = useRef<HTMLDivElement>(null)
  const keyboard = useKeyboardOpen(content)
  return (
    <ContextMenu
      onOpenChange={(opened) => {
        if (opened) focusFolder(folder.key)
      }}
      onOpenChangeComplete={keyboard.onOpenChangeComplete}
    >
      <ContextMenuTrigger render={trigger} onKeyDown={keyboard.onKeyDown} />
      <ContextMenuContent ref={content}>
        <FolderItems onOpen={onOpen} />
      </ContextMenuContent>
    </ContextMenu>
  )
}

interface FolderMoreProps {
  folder: HomeFolder
  /** Leaves Open out, as the open folder's own header does. */
  open?: boolean
  className?: string
}

/**
 * The ⋯ button opening the folder menu under it, which a card shows on hover
 * and focus and the open folder's header always shows.
 */
export function FolderMore({
  folder,
  open = true,
  className,
}: FolderMoreProps) {
  return (
    <DropdownMenu
      onOpenChange={(opened) => {
        if (opened) focusFolder(folder.key)
      }}
    >
      <DropdownMenuTrigger
        aria-label={`Folder actions for ${folder.name}`}
        className={cn(
          'inline-flex size-6 shrink-0 items-center justify-center rounded-md bg-card text-muted-foreground outline-none hover:bg-accent hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring/50 data-popup-open:bg-accent data-popup-open:text-foreground',
          className,
        )}
      >
        <Ellipsis aria-hidden className="size-4" />
      </DropdownMenuTrigger>
      <DropdownMenuContent
        align="end"
        className="w-50 rounded-[10px] text-xs shadow-[0_12px_40px_rgba(0,0,0,.3)] ring-border"
      >
        <FolderItems withOpen={open} />
      </DropdownMenuContent>
    </DropdownMenu>
  )
}

function FolderItems({
  onOpen,
  withOpen = true,
}: {
  onOpen?: () => void
  withOpen?: boolean
}) {
  const [open, rename, ungroup, pin] = useActions(IDS)
  return (
    <>
      <ContextMenuGroup>
        <ContextMenuLabel>Folder</ContextMenuLabel>
        {withOpen ? (
          <MenuItem action={open} run={onOpen} keyHint="↵" keyName="Enter">
            Open
          </MenuItem>
        ) : null}
        <MenuItem action={rename} keyHint="F2" keyName="F2">
          Rename
        </MenuItem>
        <MenuItem action={ungroup}>Ungroup</MenuItem>
      </ContextMenuGroup>
      <ContextMenuSeparator />
      <MenuItem action={pin}>{pin?.checked?.() ? 'Unpin' : 'Pin'}</MenuItem>
    </>
  )
}

interface MenuItemProps {
  /** Undefined until the home view registers it, which shows the item disabled. */
  action: Action | undefined
  /** Runs in place of the action. */
  run?: () => void
  children: ReactNode
  /** The key cap drawn at the row's end. */
  keyHint?: string
  /** The key a screen reader announces, since the cap may be a symbol. */
  keyName?: string
}

function MenuItem({ action, run, children, keyHint, keyName }: MenuItemProps) {
  return (
    <ContextMenuItem
      disabled={!action || !isEnabled(action)}
      aria-keyshortcuts={keyName}
      onClick={() => (run ? run() : action?.run())}
    >
      {children}
      {keyHint ? (
        <ContextMenuShortcut aria-hidden>{keyHint}</ContextMenuShortcut>
      ) : null}
    </ContextMenuItem>
  )
}
