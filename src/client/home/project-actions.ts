import { FolderPlus } from 'lucide-react'
import { useEffect } from 'react'
import { useLocation } from 'wouter'
import { useStore } from 'zustand'
import { createStore } from 'zustand/vanilla'

import {
  type Action,
  refreshActions,
  registerActions,
} from '@/client/actions/registry'
import { reportRefusal } from '@/client/board/left-panel/page-actions'
import { liveStore } from '@/client/live/store'
import { type Structure, structure } from '@/client/live/structure'
import { BoardWriteError } from '@/client/live/write'
import { boardUrl } from '@/shared/board-urls'
import type { ProjectRecord } from '@/shared/records/list'

/** The project a card's name shows as a rename field, with the refusal it last met. */
interface Renaming {
  project: string
  /** The name last sent, which a refused field opens with again. */
  draft: string
  /** Why the server refused `draft`, shown under the field. */
  refusal: string | null
  /** Bumped on each refusal, so the field opens afresh on the draft. */
  attempt: number
}

interface ProjectState {
  /** The card or row that last took focus or opened the menu, which the card actions act on. */
  focused: string | null
  renaming: Renaming | null
}

export const projectStore = createStore<ProjectState>()(() => ({
  focused: null,
  renaming: null,
}))

export function useRenamingProject(project: string): Renaming | null {
  return useStore(projectStore, (state) =>
    state.renaming?.project === project ? state.renaming : null,
  )
}

export function focusProject(project: string): void {
  if (projectStore.getState().focused === project) return
  projectStore.setState({ focused: project })
  refreshActions()
}

export function startProjectRename(project: string): void {
  projectStore.setState({
    renaming: { project, draft: project, refusal: null, attempt: 0 },
  })
}

export function stopProjectRename(): void {
  projectStore.setState({ renaming: null })
}

/** A project opens on its first page, or on its own route when it has none. */
export function projectHref({ name, pages }: ProjectRecord): string {
  const first = pages[0]
  return first ? boardUrl(name, first.name) : `/p/${encodeURIComponent(name)}`
}

/**
 * Renames a project through the server. A name the verb refuses as invalid
 * keeps the field open with the reason under it, and any other refusal
 * closes the field and raises the error toast.
 */
export async function renameProject(
  project: string,
  name: string,
  calls: Structure = structure,
): Promise<void> {
  projectStore.setState(({ renaming }) => ({
    renaming: renaming && { ...renaming, draft: name },
  }))
  try {
    await calls.renameProject(project, name)
  } catch (error) {
    if (error instanceof BoardWriteError && error.code === 'invalid-name') {
      projectStore.setState(({ renaming }) => ({
        renaming: renaming && {
          ...renaming,
          refusal: error.message,
          attempt: renaming.attempt + 1,
        },
      }))
      return
    }
    stopProjectRename()
    reportRefusal(`Couldn't rename ${project}`)(error)
    return
  }
  stopProjectRename()
  focusProject(name)
}

/**
 * Registers `project.new` while the home view is mounted, and `project.open`,
 * `project.rename`, `project.duplicate`, and `project.delete` acting on the
 * focused card or row. Only New project carries a palette command, since
 * opening the palette takes focus off the card the others act on. Each write
 * is lit while the tab may write, and a new project opens its name for
 * renaming.
 */
export function useProjectActions(calls: Structure = structure): void {
  const [, navigate] = useLocation()
  useEffect(() => {
    const writable = () => liveStore.getState().canWrite
    const focused = () => {
      const name = projectStore.getState().focused
      return liveStore
        .getState()
        .board?.projects.find((project) => project.name === name)
    }
    const onProject = () => writable() && focused() !== undefined

    const actions: Action[] = [
      {
        id: 'project.new',
        label: 'New project',
        group: 'project',
        command: { label: 'New project', icon: FolderPlus },
        enabled: writable,
        run: () => {
          calls.addProject().then((added) => {
            focusProject(added.name)
            startProjectRename(added.name)
          }, reportRefusal("Couldn't add a project"))
        },
      },
      {
        id: 'project.open',
        label: 'Open',
        group: 'project',
        enabled: () => focused() !== undefined,
        run: () => {
          const project = focused()
          if (project) navigate(projectHref(project))
        },
      },
      {
        id: 'project.rename',
        label: 'Rename',
        group: 'project',
        enabled: onProject,
        run: () => {
          const project = focused()
          if (project) startProjectRename(project.name)
        },
      },
      {
        id: 'project.duplicate',
        label: 'Duplicate',
        group: 'project',
        enabled: onProject,
        run: () => {
          const project = focused()
          if (!project) return
          calls
            .duplicateProject(project.name)
            .then(
              (copy) => focusProject(copy.name),
              reportRefusal(`Couldn't duplicate ${project.name}`),
            )
        },
      },
      {
        id: 'project.delete',
        label: 'Delete',
        group: 'project',
        enabled: onProject,
        run: () => {
          const project = focused()
          if (!project) return
          calls
            .deleteProject(project.name)
            .catch(reportRefusal(`Couldn't delete ${project.name}`))
        },
      },
    ]
    const unregister = registerActions(actions)
    const unsubscribe = liveStore.subscribe((state, previous) => {
      if (
        state.canWrite !== previous.canWrite ||
        state.board !== previous.board
      )
        refreshActions()
    })
    return () => {
      unsubscribe()
      unregister()
      projectStore.setState({ focused: null, renaming: null })
    }
  }, [calls, navigate])
}
