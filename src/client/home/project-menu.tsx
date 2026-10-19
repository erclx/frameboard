import {
  type KeyboardEvent,
  type ReactElement,
  type ReactNode,
  useRef,
} from 'react'

import { type Action, isEnabled, useActions } from '@/client/actions/registry'
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

import { focusProject } from './project-actions'

const IDS = [
  'project.open',
  'project.rename',
  'project.duplicate',
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
 * from. The menu key and Shift+F10 open it too, with focus on its first
 * item, since Chromium on macOS fires no `contextmenu` for Shift+F10.
 */
export function ProjectMenu({ project, trigger }: ProjectMenuProps) {
  const [open, rename, duplicate, remove] = useActions(IDS)
  const content = useRef<HTMLDivElement>(null)
  const openedByKey = useRef(false)
  return (
    <ContextMenu
      onOpenChange={(opened) => {
        if (opened) focusProject(project)
      }}
      onOpenChangeComplete={(opened) => {
        if (!opened || !openedByKey.current) return
        openedByKey.current = false
        content.current
          ?.querySelector<HTMLElement>(
            '[role="menuitem"]:not([aria-disabled="true"])',
          )
          ?.focus()
      }}
    >
      <ContextMenuTrigger
        render={trigger}
        onKeyDown={(event: KeyboardEvent<HTMLElement>) => {
          const menuKey =
            event.key === 'ContextMenu' ||
            (event.key === 'F10' && event.shiftKey)
          if (!menuKey) return
          event.preventDefault()
          openedByKey.current = true
          // The menu opens where a contextmenu event lands, so this one lands
          // inside the card, where a right click would.
          const box = event.currentTarget.getBoundingClientRect()
          event.currentTarget.dispatchEvent(
            new MouseEvent('contextmenu', {
              bubbles: true,
              cancelable: true,
              clientX: box.left + box.width / 2,
              clientY: box.top + box.height / 2,
            }),
          )
        }}
      />
      <ContextMenuContent ref={content}>
        <ContextMenuGroup>
          <ContextMenuLabel>Project</ContextMenuLabel>
          <MenuItem action={open} keyHint="↵" keyName="Enter">
            Open
          </MenuItem>
          <MenuItem action={rename}>Rename</MenuItem>
          <MenuItem action={duplicate}>Duplicate</MenuItem>
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
