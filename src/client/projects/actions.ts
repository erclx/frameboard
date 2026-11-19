import {
  Archive,
  ArchiveRestore,
  Copy,
  FolderMinus,
  FolderOpen,
  FolderPlus,
  House,
  Package,
  PencilLine,
  Pin,
  Trash2,
} from 'lucide-react'
import { useEffect } from 'react'
import { useLocation } from 'wouter'
import { useStore } from 'zustand'
import { createStore } from 'zustand/vanilla'

import { keyLabel } from '@/client/actions/keys'
import {
  type Action,
  findAction,
  isEnabled,
  refreshActions,
  registerActions,
} from '@/client/actions/registry'
import { reportRefusal } from '@/client/board/left-panel/page-actions'
import { toast } from '@/client/components/ui/toast'
import {
  folderKey,
  folderNames,
  nextFolderName,
} from '@/client/home/folders/entries'
import {
  dropPin,
  folderPin,
  movePin,
  pinnedProjects,
  togglePin,
} from '@/client/home/pins'
import { fetchKits } from '@/client/kits/kits'
import { liveStore } from '@/client/live/store'
import { type Structure, structure } from '@/client/live/structure'
import { BoardWriteError } from '@/client/live/write'
import { boardUrl } from '@/shared/board-urls'
import type { KitRecord } from '@/shared/kits'
import { nextFreeName } from '@/shared/names'
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
  /** The folder whose panel is open, by key, held here so a rename's new key keeps it open. */
  openFolder: string | null
  /** An open folder's rename in flight, held until home draws the new key, so the panel stays open whichever lands first. */
  pendingRename: { from: string; to: string } | null
  /** The project whose card takes focus once home draws it, after a write moved it out of a closed panel. */
  focusTarget: string | null
}

export const projectStore = createStore<ProjectState>()(() => ({
  focused: null,
  folder: null,
  renaming: null,
  renamingFolder: null,
  openFolder: null,
  pendingRename: null,
  focusTarget: null,
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
  const renamed = folderKey(name)
  const open = projectStore.getState().openFolder === key
  if (open) {
    projectStore.setState({
      openFolder: renamed,
      pendingRename: { from: key, to: renamed },
    })
  }
  if (!(await fileProjects(members, name, calls))) {
    if (open) projectStore.setState({ openFolder: key, pendingRename: null })
    return
  }
  if (renamed !== key) movePin(folderPin(key), folderPin(renamed))
  focusFolder(renamed)
}

/**
 * Closes a panel whose folder home no longer draws, as when its last member
 * left from inside it, so a later folder under that key never opens unasked.
 * A rename in flight keeps its panel until home draws the new key.
 */
export function settleOpenFolder(shown: ReadonlySet<string>): void {
  const { openFolder, pendingRename } = projectStore.getState()
  if (pendingRename && shown.has(pendingRename.to)) {
    projectStore.setState({ pendingRename: null })
    return
  }
  if (openFolder === null || shown.has(openFolder)) return
  if (pendingRename?.to === openFolder) return
  projectStore.setState({ openFolder: null })
}

/**
 * Takes every member out of the folder, closing its panel and handing focus
 * to the first member's card once home draws it, so focus never falls to the
 * page when the folder's card goes away.
 */
export async function ungroupFolder(
  key: string,
  calls: Structure = structure,
): Promise<void> {
  const names = folderMembers(key).map((project) => project.name)
  if (!(await fileProjects(names, null, calls))) return
  dropPin(folderPin(key))
  const first = names[0] ?? null
  projectStore.setState({ openFolder: null, focusTarget: first })
  if (first) focusProject(first)
}

/** The name a person reads for a project, its title or else its folder. */
export function projectLabel(
  project: Pick<ProjectRecord, 'name' | 'title'>,
): string {
  return project.title ?? project.name
}

/** Opens the project's name as a rename field, holding the title it shows. */
export function startProjectRename(project: string): void {
  const record = boardProjects().find((each) => each.name === project)
  const draft = record ? projectLabel(record) : project
  projectStore.setState({
    renaming: { project, draft, refusal: null, attempt: 0 },
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
 * Sets a project's title, carrying the pin to wherever the server moved the
 * folder, and resolving that folder, or null on a refusal.
 */
export async function renameProject(
  project: string,
  title: string,
  calls: Structure = structure,
): Promise<string | null> {
  projectStore.setState(({ renaming }) => ({
    renaming: renaming && { ...renaming, draft: title },
  }))
  let landed: ProjectRecord
  try {
    landed = await calls.retitleProject(project, title)
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
  if (landed.name !== project) movePin(project, landed.name)
  stopProjectRename()
  focusProject(landed.name)
  return landed.name
}

/** The focused card or row, which the home view's project actions act on. */
export function focusedProject(): string | null {
  return projectStore.getState().focused
}

/**
 * Registers home's filing actions, Open and Pin lit even read-only, since
 * neither writes the board.
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
    const projectHint = () => {
      const target = project()
      return target ? projectLabel(target) : ''
    }
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
        id: 'folder.open',
        label: 'Open',
        group: 'project',
        // Enter on a focused folder card, which opens it without the palette.
        palette: false,
        enabled: () => folder() !== undefined,
        run: () => {
          const target = folder()
          if (target) projectStore.setState({ openFolder: target.key })
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
          if (target) void ungroupFolder(target.key, calls)
        },
      },
      {
        id: 'folder.new',
        label: 'New project',
        group: 'project',
        // Run from the folder's list row menu, since the palette has `project.new`.
        palette: false,
        enabled: () => writable() && folder() !== undefined,
        run: () => {
          const target = folder()
          if (target) addProjectIn(calls, target.name)
        },
      },
      {
        id: 'folder.pin',
        label: 'Pin',
        group: 'project',
        command: { label: 'Pin folder', icon: Pin, hint: folderHint },
        enabled: () => folder() !== undefined,
        checked: () => {
          const key = projectStore.getState().folder
          return key !== null && pinnedProjects().has(folderPin(key))
        },
        run: () => {
          const target = folder()
          if (target) togglePin(folderPin(target.key))
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
      projectStore.setState({
        folder: null,
        renamingFolder: null,
        openFolder: null,
        pendingRename: null,
        focusTarget: null,
      })
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
 * Adds a project, filed in the folder `group` names when one is given, and
 * opens its name for renaming.
 */
export function addProjectIn(
  calls: Structure = structure,
  group?: string,
): void {
  calls.addProject(undefined, group).then((added) => {
    focusProject(added.name)
    startProjectRename(added.name)
  }, reportRefusal("Couldn't add a project"))
}

/**
 * Registers `project.new`, which adds a project and opens its name for
 * renaming on the home view. The board passes `leave`, which goes home before
 * the add, since leaving clears the project state and would close the rename.
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
          addProjectIn(calls)
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
 * Saves the project's look as a kit named after its folder, the next free
 * name where a kit already holds it, and says the name it was saved under,
 * or why the save was refused.
 */
export async function saveAsKit(
  project: ProjectRecord,
  calls: Structure = structure,
  loadKits: () => Promise<KitRecord[] | null> = fetchKits,
): Promise<void> {
  const kits = (await loadKits().catch(() => null)) ?? []
  const name = nextFreeName(
    project.name,
    kits.map((kit) => kit.name),
  )
  await calls.saveKit(project.name, name).then(
    () =>
      toast.add({
        title: `Saved ${projectLabel(project)} as a kit`,
        description: `Saved on this board as ${name}.`,
        type: 'success',
      }),
    reportRefusal(`Couldn't save ${projectLabel(project)} as a kit`),
  )
}

/**
 * Registers the project actions on `target`, each hinting its project, since an
 * unnamed Delete is a guess. Pass a stable `target` and `onDeleted`, since a new
 * one registers the actions again.
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
    const hint = () => {
      const target = focused()
      return target ? projectLabel(target) : ''
    }

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
        id: 'project.saveKit',
        label: 'Save as kit',
        group: 'project',
        command: { label: 'Save project as kit', icon: Package, hint },
        enabled: onProject,
        run: () => {
          const project = focused()
          if (project) void saveAsKit(project, calls)
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
          const pinned = pinnedProjects().has(project.name)
          const deleted = watchDeleteSteps()
          calls.deleteProject(project.name).then(
            () => {
              dropPin(project.name)
              deleted.show(project, pinned)
              onDeleted?.()
            },
            (error: unknown) => {
              deleted.stop()
              reportRefusal(`Couldn't delete ${project.name}`)(error)
            },
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

/** `1 page, 0 frames`, what a deleted project held, as its toast names it. */
function heldCopy(project: ProjectRecord): string {
  const pages = project.pages.length
  const frames = project.pages.reduce(
    (sum, page) => sum + page.frames.length,
    0,
  )
  return `${pages} ${pages === 1 ? 'page' : 'pages'}, ${frames} ${frames === 1 ? 'frame' : 'frames'}`
}

/**
 * Counts history messages from before a delete is sent, since the capped
 * journal cannot tell a later step from the delete's, closing its Undo toast
 * once a newer step lands.
 */
function watchDeleteSteps(): {
  show: (project: ProjectRecord, pinned: boolean) => void
  stop: () => void
} {
  let steps = 0
  let id: string | null = null
  let waiting: (() => void) | null = null
  const unsubscribe = liveStore.subscribe((state, previous) => {
    if (state.history === previous.history) return
    steps++
    if (waiting) {
      const run = waiting
      waiting = null
      unsubscribe()
      run()
    } else if (steps > 1) close()
  })
  const close = () => {
    if (id !== null) toast.close(id)
    id = null
  }
  const stop = () => {
    if (!waiting) unsubscribe()
  }
  // Restores the pin by hand once the undo runs, since a pin lives outside the journal.
  const undoFor = (project: ProjectRecord, pinned: boolean) => () => {
    const action = findAction('edit.undo')
    if (!action || !isEnabled(action)) return
    action.run()
    if (pinned && !pinnedProjects().has(project.name)) togglePin(project.name)
  }
  return {
    stop,
    show: (project, pinned) => {
      if (steps > 1) {
        unsubscribe()
        return
      }
      const key = findAction('edit.undo')?.keys?.[0]
      id = toast.add({
        title: `Deleted ${project.name}`,
        description: heldCopy(project),
        // It stays until dismissed or the next step, which closes it.
        timeout: 0,
        onClose: stop,
        actionProps: {
          children: 'Undo',
          title: key ? `Undo ${keyLabel(key)}` : 'Undo',
          'aria-keyshortcuts': key ? keyLabel(key) : undefined,
          onClick: () => {
            const undo = undoFor(project, pinned)
            if (steps === 0) waiting = undo
            else {
              unsubscribe()
              undo()
            }
            close()
          },
        },
      })
    },
  }
}
