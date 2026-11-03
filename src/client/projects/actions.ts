import {
  Archive,
  ArchiveRestore,
  Copy,
  FolderMinus,
  FolderOpen,
  FolderPlus,
  House,
  PencilLine,
  Pin,
  Trash2,
} from 'lucide-react'
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
import {
  folderKey,
  folderNames,
  nextFolderName,
} from '@/client/home/folders/entries'
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

/** The folder whose name shows as a rename field, keyed as `folderKey` reads it. */
interface FolderRenaming {
  folder: string
  draft: string
  refusal: string | null
  attempt: number
}

interface ProjectState {
  /** The card or row that last took focus or opened the menu, which the card actions act on. */
  focused: string | null
  /** The folder card or row that last took focus, by key, which the folder actions act on. */
  folder: string | null
  renaming: Renaming | null
  renamingFolder: FolderRenaming | null
}

export const projectStore = createStore<ProjectState>()(() => ({
  focused: null,
  folder: null,
  renaming: null,
  renamingFolder: null,
}))

export function useRenamingProject(project: string): Renaming | null {
  return useStore(projectStore, (state) =>
    state.renaming?.project === project ? state.renaming : null,
  )
}

export function focusProject(project: string): void {
  const { focused, folder } = projectStore.getState()
  if (focused === project && folder === null) return
  projectStore.setState({ focused: project, folder: null })
  refreshActions()
}

/** Focuses a folder card or row by its key, which leaves no project focused. */
export function focusFolder(key: string): void {
  const { focused, folder } = projectStore.getState()
  if (folder === key && focused === null) return
  projectStore.setState({ focused: null, folder: key })
  refreshActions()
}

export function useRenamingFolder(key: string): FolderRenaming | null {
  return useStore(projectStore, (state) =>
    state.renamingFolder?.folder === key ? state.renamingFolder : null,
  )
}

export function startFolderRename(key: string, name: string): void {
  projectStore.setState({
    renamingFolder: { folder: key, draft: name, refusal: null, attempt: 0 },
  })
}

export function stopFolderRename(): void {
  projectStore.setState({ renamingFolder: null })
}

/** The board's projects as the live store holds them. */
function boardProjects(): readonly ProjectRecord[] {
  return liveStore.getState().board?.projects ?? []
}

/** The projects filed under the folder `key`. */
export function folderMembers(key: string): ProjectRecord[] {
  return boardProjects().filter(
    (project) => project.group !== null && folderKey(project.group) === key,
  )
}

/**
 * Files projects under `group` through the server, `null` taking them out of
 * their folder, raising the error toast on a refusal. Resolves whether the
 * write landed.
 */
export async function fileProjects(
  projects: readonly string[],
  group: string | null,
  calls: Structure = structure,
): Promise<boolean> {
  try {
    await calls.groupProjects(projects, group)
    return true
  } catch (error) {
    const what = projects.length === 1 ? projects[0] : 'the projects'
    reportRefusal(
      group === null
        ? `Couldn't take ${what} out of its folder`
        : `Couldn't move ${what} to ${group}`,
    )(error)
    return false
  }
}

/** Moves projects into home's Archived section or back, raising the error toast on a refusal. */
export async function archiveProjects(
  projects: readonly string[],
  archived: boolean,
  calls: Structure = structure,
): Promise<void> {
  try {
    await calls.archiveProjects(projects, archived)
  } catch (error) {
    const what = projects.length === 1 ? projects[0] : 'the projects'
    reportRefusal(
      archived ? `Couldn't archive ${what}` : `Couldn't restore ${what}`,
    )(error)
  }
}

/**
 * Files projects in a new folder under the next free `Folder` name and opens
 * that name for renaming, as a new project opens its own.
 */
export async function fileInNewFolder(
  projects: readonly string[],
  calls: Structure = structure,
): Promise<void> {
  const name = nextFolderName(folderNames(boardProjects()))
  if (!(await fileProjects(projects, name, calls))) return
  focusFolder(folderKey(name))
  startFolderRename(folderKey(name), name)
}

/**
 * Renames a folder by writing the new name to every member, so two spellings
 * become one. A name another folder holds in any case keeps the field open
 * with the reason, since writing it would merge the two.
 */
export async function renameFolder(
  key: string,
  name: string,
  calls: Structure = structure,
): Promise<void> {
  const taken = folderNames(boardProjects()).find(
    (other) => folderKey(other) === folderKey(name) && folderKey(other) !== key,
  )
  if (taken) {
    projectStore.setState(({ renamingFolder }) => ({
      renamingFolder: renamingFolder && {
        ...renamingFolder,
        draft: name,
        refusal: `A folder named ${taken} already exists.`,
        attempt: renamingFolder.attempt + 1,
      },
    }))
    return
  }
  stopFolderRename()
  const members = folderMembers(key).map((project) => project.name)
  if (await fileProjects(members, name, calls)) focusFolder(folderKey(name))
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

/**
 * Registers the filing actions while the home view is mounted:
 * `project.group` filing the focused project in a new folder,
 * `project.ungroup` taking it out of its own, `project.archive` and
 * `project.restore` moving it into the Archived section and back, and
 * `folder.rename` and `folder.ungroup` acting on the focused folder. Each is
 * lit while the tab may write and its target exists.
 */
export function useFolderActions(calls: Structure = structure): void {
  useEffect(() => {
    const writable = () => liveStore.getState().canWrite
    const project = () => {
      const name = projectStore.getState().focused
      return boardProjects().find((record) => record.name === name)
    }
    const folder = () => {
      const key = projectStore.getState().folder
      const members = key === null ? [] : folderMembers(key)
      const first = members[0]
      return key !== null && first?.group
        ? { key, name: first.group, members }
        : undefined
    }
    const projectHint = () => project()?.name ?? ''
    const folderHint = () => folder()?.name ?? ''
    const unregister = registerActions([
      {
        id: 'project.group',
        label: 'New folder',
        group: 'project',
        command: {
          label: 'Move project to a new folder',
          icon: FolderPlus,
          hint: projectHint,
        },
        enabled: () => writable() && project() !== undefined,
        run: () => {
          const target = project()
          if (target) void fileInNewFolder([target.name], calls)
        },
      },
      {
        id: 'project.ungroup',
        label: 'Remove from folder',
        group: 'project',
        command: {
          label: 'Remove project from its folder',
          icon: FolderMinus,
          hint: projectHint,
        },
        enabled: () => writable() && (project()?.group ?? null) !== null,
        run: () => {
          const target = project()
          if (target) void fileProjects([target.name], null, calls)
        },
      },
      {
        id: 'project.archive',
        label: 'Archive',
        group: 'project',
        command: { label: 'Archive project', icon: Archive, hint: projectHint },
        enabled: () => writable() && project()?.archived === false,
        run: () => {
          const target = project()
          if (target) void archiveProjects([target.name], true, calls)
        },
      },
      {
        id: 'project.restore',
        label: 'Restore',
        group: 'project',
        command: {
          label: 'Restore archived project',
          icon: ArchiveRestore,
          hint: projectHint,
        },
        enabled: () => writable() && project()?.archived === true,
        run: () => {
          const target = project()
          if (target) void archiveProjects([target.name], false, calls)
        },
      },
      {
        id: 'folder.rename',
        label: 'Rename',
        group: 'project',
        command: {
          label: 'Rename folder',
          icon: PencilLine,
          hint: folderHint,
        },
        enabled: () => writable() && folder() !== undefined,
        run: () => {
          const target = folder()
          if (target) startFolderRename(target.key, target.name)
        },
      },
      {
        id: 'folder.ungroup',
        label: 'Ungroup',
        group: 'project',
        command: {
          label: 'Ungroup folder',
          icon: FolderOpen,
          hint: folderHint,
        },
        enabled: () => writable() && folder() !== undefined,
        run: () => {
          const target = folder()
          if (!target) return
          const names = target.members.map((member) => member.name)
          void fileProjects(names, null, calls).then((landed) => {
            if (landed && names[0]) focusProject(names[0])
          })
        },
      },
    ])
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
      projectStore.setState({ folder: null, renamingFolder: null })
    }
  }, [calls])
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
 * Registers `project.new` while the home view or a board is mounted, and a
 * new project opens its name for renaming on the home view. It is lit while
 * the tab may write. The board passes `leave`, which goes home before the add
 * rather than after, since leaving clears the board's project state and would
 * close the rename field the add opened.
 */
export function useNewProjectAction(
  calls: Structure = structure,
  leave?: () => void,
): void {
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
          leave?.()
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
  }, [calls, leave])
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
        // Enter on a focused home card, which the palette's project rows cover.
        palette: false,
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
