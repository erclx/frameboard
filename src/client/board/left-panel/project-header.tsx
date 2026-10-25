import { ChevronDown, House, PanelLeft } from 'lucide-react'
import { Link, useLocation } from 'wouter'

import { isEnabled, useActions } from '@/client/actions/registry'
import { RenameField } from '@/client/components/rename-field'
import {
  DropdownMenu,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuSub,
  DropdownMenuSubContent,
  DropdownMenuSubTrigger,
  DropdownMenuTrigger,
} from '@/client/components/ui/dropdown-menu'
import { useLive } from '@/client/live/store'
import type { Structure } from '@/client/live/structure'
import {
  projectHref,
  renameProject,
  stopProjectRename,
  useRenamingProject,
} from '@/client/projects/actions'
import { boardUrl } from '@/shared/board-urls'
import type { ProjectRecord } from '@/shared/records/list'

import { ActionTooltip } from '../chrome/action-tooltip'
import { ActionMenuItem, ChromeMenuContent, MENU_ROW } from '../chrome/menu'

const IDS = [
  'view.hideUi',
  'project.rename',
  'project.duplicate',
  'nav.home',
] as const

const NO_PROJECTS: readonly ProjectRecord[] = []

interface ProjectHeaderProps {
  project: ProjectRecord
  /** The page on the canvas, which a rename keeps the board on. */
  page: string
  /** The server calls a rename writes through, the board's own when absent. */
  calls?: Structure
}

/**
 * The left panel's header of `canon/design/layers/pages`: the way home, the
 * project name, and Hide UI. A click on the name renames the project, and
 * its chevron opens Rename, Duplicate, a Switch project submenu, and All
 * projects, built from the chrome menu of `canon/design/menus/avatar`.
 */
export function ProjectHeader({ project, page, calls }: ProjectHeaderProps) {
  const [hideUi, rename, duplicate, home] = useActions(IDS)
  const renaming = useRenamingProject(project.name)
  const projects = useLive((state) => state.board?.projects ?? NO_PROJECTS)
  const [, navigate] = useLocation()
  const others = projects.filter((other) => other.name !== project.name)
  const canRename = rename !== undefined && isEnabled(rename)
  return (
    <div className="flex h-11 shrink-0 items-center gap-1.5 border-b border-sidebar-border px-2">
      <ActionTooltip label="Home" side="bottom">
        <Link href="/" aria-label="Home" className={ICON_BUTTON}>
          <House aria-hidden className="size-[15px]" />
        </Link>
      </ActionTooltip>
      {renaming ? (
        <span className="flex min-w-0 flex-1 text-panel">
          <RenameField
            key={renaming.attempt}
            name={renaming.draft}
            label={`Rename project ${project.name}`}
            onCommit={(name) => {
              void renameProject(project.name, name, calls).then((landed) => {
                if (landed) navigate(boardUrl(landed, page), { replace: true })
              })
            }}
            onCancel={stopProjectRename}
          />
        </span>
      ) : (
        <span className="flex min-w-0 flex-1 items-center">
          <button
            type="button"
            disabled={!canRename}
            title={canRename ? `Rename ${project.name}` : project.name}
            onClick={() => rename?.run()}
            className="min-w-0 truncate rounded-[5px] px-1 -ml-1 text-left text-panel outline-none hover:bg-sidebar-accent focus-visible:ring-2 focus-visible:ring-ring/50 disabled:hover:bg-transparent"
          >
            {project.name}
          </button>
          <DropdownMenu>
            <DropdownMenuTrigger
              aria-label="Project menu"
              className="grid size-6 shrink-0 place-items-center rounded-[5px] text-muted-foreground outline-none hover:bg-sidebar-accent hover:text-sidebar-foreground focus-visible:ring-2 focus-visible:ring-ring/50 aria-expanded:bg-sidebar-accent"
            >
              <ChevronDown aria-hidden className="size-3" />
            </DropdownMenuTrigger>
            <ChromeMenuContent align="start" sideOffset={6} className="w-56">
              <ActionMenuItem action={rename} label="Rename" />
              <ActionMenuItem action={duplicate} label="Duplicate" />
              <DropdownMenuSub>
                <DropdownMenuSubTrigger
                  disabled={others.length === 0}
                  className={MENU_ROW}
                >
                  Switch project
                </DropdownMenuSubTrigger>
                <DropdownMenuSubContent className="w-56 rounded-[10px] p-1 text-xs shadow-[0_12px_40px_rgba(0,0,0,.3)] ring-border">
                  {others.map((other) => (
                    <DropdownMenuItem
                      key={other.name}
                      onClick={() => navigate(projectHref(other))}
                      className={MENU_ROW}
                    >
                      <span className="truncate">{other.name}</span>
                    </DropdownMenuItem>
                  ))}
                </DropdownMenuSubContent>
              </DropdownMenuSub>
              <DropdownMenuSeparator />
              <ActionMenuItem action={home} label="All projects" />
            </ChromeMenuContent>
          </DropdownMenu>
        </span>
      )}
      <ActionTooltip label="Hide UI" keys={hideUi?.keys} side="bottom">
        <button
          type="button"
          aria-label="Hide UI"
          onClick={() => hideUi?.run()}
          className={ICON_BUTTON}
        >
          <PanelLeft aria-hidden className="size-[15px]" />
        </button>
      </ActionTooltip>
    </div>
  )
}

const ICON_BUTTON =
  'grid size-[26px] shrink-0 place-items-center rounded-md text-muted-foreground outline-none hover:bg-accent hover:text-foreground focus-visible:ring-3 focus-visible:ring-ring/50'
