import { Plus } from 'lucide-react'
import { useStore } from 'zustand'

import { Button } from '@/client/components/ui/button'
import {
  DialogContent,
  DialogDescription,
  DialogTitle,
} from '@/client/components/ui/dialog'
import { useLive } from '@/client/live/store'
import type { Structure } from '@/client/live/structure'
import { unseenUnder, useUnseen } from '@/client/live/unseen'
import { addProjectIn, projectStore } from '@/client/projects/actions'

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
 * The open folder over home per `folders-menu-inline-720`, its ⋯ focusing the
 * folder as it opens, so its actions never land on a focused member.
 */
export function FolderPanel({ folder, now, calls, captures }: PanelProps) {
  const unseen = useUnseen((state) => state.unseen)
  const focused = useStore(projectStore, (state) => state.focused)
  const pins = usePins()
  const canWrite = useLive((state) => state.canWrite)
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
            hug
          />
        </DialogTitle>
        <FolderPen folder={folder} />
        <DialogDescription className="sr-only">
          {countOf(folder)}
        </DialogDescription>
        <span className="ml-auto flex items-center gap-2">
          <Button
            variant="outline"
            size="sm"
            disabled={!canWrite}
            onClick={() => addProjectIn(calls, folder.name)}
          >
            <Plus aria-hidden />
            New project
          </Button>
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
