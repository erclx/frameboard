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
  ContextMenuSub,
  ContextMenuSubContent,
  ContextMenuSubTrigger,
  ContextMenuTrigger,
} from '@/client/components/ui/context-menu'
import { useLive } from '@/client/live/store'
import type { Structure } from '@/client/live/structure'
import { fileProjects, focusProject } from '@/client/projects/actions'

import { folderKey, folderNames } from './folders/entries'

const IDS = [
  'project.open',
  'project.rename',
  'project.duplicate',
  'project.pin',
  'project.group',
  'project.ungroup',
  'project.delete',
] as const

interface ProjectMenuProps {
  project: string
  /** The card or row the menu opens on, which keeps focus when it closes. */
  trigger: ReactElement
  /** Stands in for the server's structure routes, as a test's server does. */
  calls?: Structure
}

/**
 * The right-click menu of `canon/design/menus/home` on a project's card or
 * row, its items running the `project.*` actions on the project it opened
 * from, Pin reading Unpin on a pinned one. Move to folder lists every other
 * folder and New folder, and Remove from folder shows on a filed project. The menu key and Shift+F10 open it too, with focus on its first item.
 */
export function ProjectMenu({ project, trigger, calls }: ProjectMenuProps) {
  const [open, rename, duplicate, pin, newFolder, ungroup, remove] =
    useActions(IDS)
  const projects = useLive((state) => state.board?.projects)
  const record = projects?.find((candidate) => candidate.name === project)
  const group = record?.group ?? null
  const others = folderNames(projects ?? []).filter(
    (name) => group === null || folderKey(name) !== folderKey(group),
  )
  const canWrite = useLive((state) => state.canWrite)
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
        <ContextMenuGroup>
          <ContextMenuSub>
            <ContextMenuSubTrigger
              disabled={!canWrite || !record}
              className="h-7 px-2 py-0 text-xs"
            >
              Move to folder
            </ContextMenuSubTrigger>
            <ContextMenuSubContent>
              {others.map((name) => (
                <ContextMenuItem
                  key={name}
                  onClick={() => void fileProjects([project], name, calls)}
                >
                  {name}
                </ContextMenuItem>
              ))}
              {others.length > 0 ? <ContextMenuSeparator /> : null}
              <MenuItem action={newFolder}>New folder</MenuItem>
            </ContextMenuSubContent>
          </ContextMenuSub>
          {group === null ? null : (
            <MenuItem action={ungroup}>Remove from folder</MenuItem>
          )}
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
