import { useStore } from 'zustand'

import { isEnabled, useActions } from '@/client/actions/registry'
import { Button } from '@/client/components/ui/button'
import {
  DialogContent,
  DialogDescription,
  DialogTitle,
} from '@/client/components/ui/dialog'
import type { Structure } from '@/client/live/structure'
import { unseenUnder, useUnseen } from '@/client/live/unseen'
import { focusFolder, projectStore } from '@/client/projects/actions'

import { usePins } from '../pins'
import { type Captures, ProjectCard } from '../project-card'
import { roveFocus } from '../rove'
import { countOf, type HomeFolder } from './entries'
import { FolderName } from './name'

export interface PanelProps {
  folder: HomeFolder
  /** The time "last edited" counts back from. */
  now: number
  /** Stands in for the server's structure routes, as a test's server does. */
  calls: Structure | undefined
  captures: Captures
}

const IDS = ['folder.rename', 'folder.ungroup'] as const

/**
 * The open folder over home, per `22-fix-open.png`: its name with Rename and
 * Ungroup at the top, over its members as cards that open, rename, and carry
 * the card menu as they do on home. Its parent `Dialog` holds it open.
 */
export function FolderPanel({ folder, now, calls, captures }: PanelProps) {
  const [rename, ungroup] = useActions(IDS)
  const unseen = useUnseen((state) => state.unseen)
  const focused = useStore(projectStore, (state) => state.focused)
  const pins = usePins()
  const rover = folder.projects.some((project) => project.name === focused)
    ? focused
    : folder.projects[0]?.name
  const run = (action: typeof rename) => {
    focusFolder(folder.key)
    action?.run()
  }
  return (
    <DialogContent
      showCloseButton={false}
      className="gap-3 p-4 sm:max-w-[560px]"
    >
      <div className="flex min-w-0 items-center gap-3">
        <DialogTitle
          render={<div />}
          className="min-w-0 flex-1 text-title font-semibold"
        >
          <FolderName
            folder={folder}
            calls={calls}
            type="text-title"
            unseen={0}
          />
        </DialogTitle>
        <DialogDescription className="sr-only">
          {countOf(folder)}
        </DialogDescription>
        <span className="flex shrink-0 items-center text-muted-foreground">
          <Button
            variant="ghost"
            size="sm"
            disabled={!rename || !isEnabled(rename)}
            onClick={() => run(rename)}
          >
            Rename
          </Button>
          <span aria-hidden>·</span>
          <Button
            variant="ghost"
            size="sm"
            disabled={!ungroup || !isEnabled(ungroup)}
            onClick={() => run(ungroup)}
          >
            Ungroup
          </Button>
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
