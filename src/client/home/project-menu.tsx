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
  ContextMenuSub,
  ContextMenuSubContent,
  ContextMenuSubTrigger,
  ContextMenuTrigger,
} from '@/client/components/ui/context-menu'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuTrigger,
} from '@/client/components/ui/dropdown-menu'
import { useLive } from '@/client/live/store'
import type { Structure } from '@/client/live/structure'
import { fileProjects, focusProject } from '@/client/projects/actions'

import { folderKey, folderNames } from './folders/entries'

const IDS = [
  'project.open',
  'project.rename',
  'project.duplicate',
  'project.saveKit',
  'project.pin',
  'project.group',
  'project.ungroup',
  'project.archive',
  'project.restore',
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
 * A project's right-click menu per `canon/design/menus/home`, running the
 * `project.*` actions on the project it opened from.
 */
export function ProjectMenu({ project, trigger, calls }: ProjectMenuProps) {
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
        <ProjectItems project={project} calls={calls} />
      </ContextMenuContent>
    </ContextMenu>
  )
}

interface ProjectMoreProps {
  project: string
  /** The name the button's label reads, the project's title or else its folder. */
  label: string
  className?: string
  calls?: Structure
}

/**
 * The More button on a card's corner, opening under it the same items the
 * right-click menu holds, acting on the card's project.
 */
export function ProjectMore({
  project,
  label,
  className,
  calls,
}: ProjectMoreProps) {
  return (
    <DropdownMenu
      onOpenChange={(opened) => {
        if (opened) focusProject(project)
      }}
    >
      <DropdownMenuTrigger
        aria-label={`Project actions for ${label}`}
        // Out of the tab sequence, as the corner's other buttons are.
        tabIndex={-1}
        className={className}
      >
        <Ellipsis aria-hidden className="size-3" />
      </DropdownMenuTrigger>
      <DropdownMenuContent
        align="end"
        className="w-50 rounded-[10px] text-xs shadow-[0_12px_40px_rgba(0,0,0,.3)] ring-border"
      >
        <ProjectItems project={project} calls={calls} />
      </DropdownMenuContent>
    </DropdownMenu>
  )
}

/** The project items both menus hold, Pin reading Unpin on a pinned project. */
function ProjectItems({
  project,
  calls,
}: {
  project: string
  calls: Structure | undefined
}) {
  const [
    open,
    rename,
    duplicate,
    saveKit,
    pin,
    newFolder,
    ungroup,
    archive,
    restore,
    remove,
  ] = useActions(IDS)
  const projects = useLive((state) => state.board?.projects)
  const record = projects?.find((candidate) => candidate.name === project)
  const group = record?.group ?? null
  const others = folderNames(projects ?? []).filter(
    (name) => group === null || folderKey(name) !== folderKey(group),
  )
  const canWrite = useLive((state) => state.canWrite)
  return (
    <>
      <ContextMenuGroup>
        <ContextMenuLabel>Project</ContextMenuLabel>
        <MenuItem action={open} keyHint="↵" keyName="Enter">
          Open
        </MenuItem>
        <MenuItem action={rename}>Rename</MenuItem>
        <MenuItem action={duplicate}>Duplicate</MenuItem>
        <MenuItem action={saveKit}>Save as kit</MenuItem>
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
        {record?.archived ? (
          <MenuItem action={restore}>Restore</MenuItem>
        ) : (
          <MenuItem action={archive}>Archive</MenuItem>
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
    </>
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
