import { Copy, FolderPlus, House, PencilLine, Pin, Trash2 } from 'lucide-react'
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
import { dropPin, movePin, pinnedProjects, togglePin } from '@/client/home/pins'
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
 * Renames a project through the server, carrying its pin to the new name.
 * The new board guide renames through the structure client and carries the
 * pin itself. A name the verb refuses as invalid
 * keeps the field open with the reason under it, and any other refusal
 * closes the field and raises the error toast. Resolves the new name, or
 * null when the project kept its own.
 */
export async function renameProject(
  project: string,
  name: string,
  calls: Structure = structure,
): Promise<string | null> {
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
      return null
    }
    stopProjectRename()
    reportRefusal(`Couldn't rename ${project}`)(error)
    return null
  }
  movePin(project, name)
  stopProjectRename()
  focusProject(name)
  return name
}

/** The focused card or row, which the home view's project actions act on. */
export function focusedProject(): string | null {
  return projectStore.getState().focused
}

interface ProjectActionsOptions {
  /** Stands in for the server's structure routes, as a test's server does. */
  calls?: Structure
  /** Runs once a delete lands, as the board leaves the project it showed. */
  onDeleted?: () => void
}

/** Registers `nav.home` while the board is mounted, the palette's Go to all projects. */
export function useHomeAction(goHome: () => void): void {
  useEffect(
    () =>
      registerActions([
        {
          id: 'nav.home',
          label: 'All projects',
          group: 'project',
          command: { label: 'Go to all projects', icon: House },
          // Windows Explorer's up a level, since Cmd+ArrowUp resizes a frame.
          keys: ['Alt+ArrowUp'],
          run: goHome,
        },
      ]),
    [goHome],
  )
}

/**
 * Registers `project.new` while the home view is mounted, and a new project
 * opens its name for renaming. It is lit while the tab may write.
 */
export function useNewProjectAction(calls: Structure = structure): void {
  useEffect(() => {
    const writable = () => liveStore.getState().canWrite
    const unregister = registerActions([
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
    ])
    const unsubscribe = liveStore.subscribe((state, previous) => {
      if (state.canWrite !== previous.canWrite) refreshActions()
    })
    return () => {
      unsubscribe()
      unregister()
    }
  }, [calls])
}

/**
 * Registers `project.open`, `project.rename`, `project.duplicate`,
 * `project.pin`, and `project.delete` acting on the project `target` names,
 * the focused card on the home view and the open project on the board.
 * Rename, Duplicate, Pin, and Delete reach the palette only while there is a
 * target, each naming it as the row's hint, since an unnamed Delete is a
 * guess. Each write is lit while the tab may write, and Pin whenever there is
 * a target, since a pin lives in the browser rather than the board. Pass a stable `target` and `onDeleted`, since a new one
 * registers the actions again.
 */
export function useProjectActions(
  target: () => string | null,
  { calls = structure, onDeleted }: ProjectActionsOptions = {},
): void {
  const [, navigate] = useLocation()
  useEffect(() => {
    const writable = () => liveStore.getState().canWrite
    const focused = () => {
      const name = target()
      return liveStore
        .getState()
        .board?.projects.find((project) => project.name === name)
    }
    const onProject = () => writable() && focused() !== undefined
    const hint = () => focused()?.name ?? ''

    const actions: Action[] = [
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
        command: { label: 'Rename project', icon: PencilLine, hint },
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
        command: { label: 'Duplicate project', icon: Copy, hint },
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
        id: 'project.pin',
        label: 'Pin',
        group: 'project',
        command: { label: 'Pin project', icon: Pin, hint },
        enabled: () => focused() !== undefined,
        checked: () => pinnedProjects().has(target() ?? ''),
        run: () => {
          const project = focused()
          if (project) togglePin(project.name)
        },
      },
      {
        id: 'project.delete',
        label: 'Delete',
        group: 'project',
        command: { label: 'Delete project', icon: Trash2, hint },
        enabled: onProject,
        run: () => {
          const project = focused()
          if (!project) return
          calls.deleteProject(project.name).then(
            () => {
              dropPin(project.name)
              onDeleted?.()
            },
            reportRefusal(`Couldn't delete ${project.name}`),
          )
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
  }, [calls, navigate, target, onDeleted])
}
