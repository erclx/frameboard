import { useStore } from 'zustand'

import {
  DialogContent,
  DialogDescription,
  DialogTitle,
} from '@/client/components/ui/dialog'
import type { Structure } from '@/client/live/structure'
import { unseenUnder, useUnseen } from '@/client/live/unseen'
import { projectStore } from '@/client/projects/actions'

import { usePins } from '../pins'
import { type Captures, ProjectCard } from '../project-card'
import { roveFocus } from '../rove'
import { countOf, type HomeFolder } from './entries'
import { FolderMore } from './menu'
import { FolderName, FolderPen } from './name'

export interface PanelProps {
  folder: HomeFolder
  /** The time "last edited" counts back from. */
  now: number
  /** Stands in for the server's structure routes, as a test's server does. */
  calls: Structure | undefined
  captures: Captures
}

/**
 * The open folder over home, per `folders-menu-inline-720`: its name as the
 * one heading with the folder menu's ⋯ beside it, over its members as cards
 * that open, rename, and carry the card menu as they do on home. Its parent
 * `Dialog` holds it open. The ⋯ focuses this folder as it opens, so Rename,
 * Ungroup, and Pin act on it even when focus had moved onto a member, and a
 * double click on the name or one click on the pen beside it renames it in
 * place.
 */
export function FolderPanel({ folder, now, calls, captures }: PanelProps) {
  const unseen = useUnseen((state) => state.unseen)
  const focused = useStore(projectStore, (state) => state.focused)
  const pins = usePins()
  const rover = folder.projects.some((project) => project.name === focused)
    ? focused
    : folder.projects[0]?.name
  return (
    <DialogContent
      showCloseButton={false}
      className="gap-3 p-4 sm:max-w-[560px]"
    >
      <div className="group flex min-w-0 items-center gap-3">
        {/* The title hugs the name so the pen sits beside it, and fills the header while the field is open. */}
        <DialogTitle
          render={<div />}
          className="min-w-0 text-title font-semibold has-[input]:flex-1"
        >
          <FolderName
            folder={folder}
            calls={calls}
            type="text-title"
            unseen={0}
          />
        </DialogTitle>
        <FolderPen folder={folder} />
        <DialogDescription className="sr-only">
          {countOf(folder)}
        </DialogDescription>
        <span className="ml-auto flex">
          <FolderMore folder={folder} open={false} />
        </span>
      </div>
      <ul
        onKeyDown={(event) => roveFocus(event, 'grid')}
        className="grid max-h-[70vh] grid-cols-[repeat(auto-fill,minmax(150px,1fr))] gap-3 overflow-y-auto p-0.5"
      >
        {folder.projects.map((project) => (
          <li key={project.name}>
            <ProjectCard
              project={project}
              tabbable={project.name === rover}
              calls={calls}
              unseen={unseenUnder(unseen, project.name)}
              pinned={pins.has(project.name)}
              now={now}
              captures={captures}
            />
          </li>
        ))}
      </ul>
    </DialogContent>
  )
}
