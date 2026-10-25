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
import { focusProject } from '@/client/projects/actions'

const IDS = [
  'project.open',
  'project.rename',
  'project.duplicate',
  'project.pin',
  'project.delete',
] as const

interface ProjectMenuProps {
  project: string
  /** The card or row the menu opens on, which keeps focus when it closes. */
  trigger: ReactElement
}

/**
 * The right-click menu of `canon/design/menus/home` on a project's card or
 * row, its items running the `project.*` actions on the project it opened
 * from, Pin reading Unpin on a pinned one. The menu key and Shift+F10 open it too, with focus on its first item.
 */
export function ProjectMenu({ project, trigger }: ProjectMenuProps) {
  const [open, rename, duplicate, pin, remove] = useActions(IDS)
  const content = useRef<HTMLDivElement>(null)
  const keyboard = useKeyboardOpen(content)
  return (
    <ContextMenu
      onOpenChange={(opened) => {
        if (opened) focusProject(project)
      }}
      onOpenChangeComplete={keyboard.onOpenChangeComplete}
    >
      <ContextMenuTrigger render={trigger} onKeyDown={keyboard.onKeyDown} />
      <ContextMenuContent ref={content}>
        <ContextMenuGroup>
          <ContextMenuLabel>Project</ContextMenuLabel>
          <MenuItem action={open} keyHint="↵" keyName="Enter">
            Open
          </MenuItem>
          <MenuItem action={rename}>Rename</MenuItem>
          <MenuItem action={duplicate}>Duplicate</MenuItem>
          <MenuItem action={pin}>{pin?.checked?.() ? 'Unpin' : 'Pin'}</MenuItem>
        </ContextMenuGroup>
        <ContextMenuSeparator />
        <MenuItem
          action={remove}
          keyHint="⌫"
          keyName="Delete"
          variant="destructive"
        >
          Delete
        </MenuItem>
      </ContextMenuContent>
    </ContextMenu>
  )
}

interface MenuItemProps {
  /** Undefined until the home view registers it, which shows the item disabled. */
  action: Action | undefined
  children: ReactNode
  /** The key cap drawn at the row's end. */
  keyHint?: string
  /** The key a screen reader announces, since the cap is a symbol. */
  keyName?: string
  variant?: 'default' | 'destructive'
}

function MenuItem({
  action,
  children,
  keyHint,
  keyName,
  variant,
}: MenuItemProps) {
  return (
    <ContextMenuItem
      variant={variant}
      disabled={!action || !isEnabled(action)}
      aria-keyshortcuts={keyName}
      onClick={() => action?.run()}
    >
      {children}
      {keyHint ? (
        <ContextMenuShortcut aria-hidden>{keyHint}</ContextMenuShortcut>
      ) : null}
    </ContextMenuItem>
  )
}
