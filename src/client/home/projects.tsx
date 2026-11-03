import { cn } from 'cn'
import { Fragment, type ReactNode, useEffect, useRef, useState } from 'react'
import { useStore } from 'zustand'

import { useLive } from '@/client/live/store'
import type { Structure } from '@/client/live/structure'
import { unseenUnder, useUnseen } from '@/client/live/unseen'
import {
  fileInNewFolder,
  fileProjects,
  projectHref,
  projectStore,
  useRenamingFolder,
  useRenamingProject,
} from '@/client/projects/actions'
import { useShownTheme } from '@/client/theme/store'
import type { ProjectRecord } from '@/shared/records/list'

import { Archived } from './archived'
import { filterProjects, setHomeFilter } from './filter'
import { FilterField } from './filter-field'
import { FolderCard } from './folders/card'
import { type DropTarget, useHomeDrag } from './folders/drop'
import { homeEntries, type HomeEntry } from './folders/entries'
import { FolderRow } from './folders/row'
import type { HomeLayout } from './layout'
import { usePins } from './pins'
import { ProjectCard, ProjectRow, ROW_COLUMNS } from './project-card'
import { roveFocus } from './rove'
import { SortMenu } from './sort-menu'

interface ProjectsProps {
  /** In the order shown, which the arrow keys and the tab stop follow. */
  projects: readonly ProjectRecord[]
  layout: HomeLayout
  /** The time "last edited" counts back from. */
  now: number
  /** Stands in for the server's structure routes, as a test's server does. */
  calls?: Structure
  /** The name filter typed, which shows its matches flat, out of their folders. */
  filter?: string
  /** The archived projects in the order shown, in their own section after the rest. */
  archived?: readonly ProjectRecord[]
}

/**
 * Every project on the board as cards, per `canon/design/home/grid`, or as
 * rows, per `canon/design/home/list`, each opening its board and the menu of
 * `canon/design/menus/home`. A project filed in a folder sits in the folder's
 * card, which opens a panel, or under the folder's row, which opens in place.
 * A pinned project carries the pin mark after its name, and a folder holding
 * one rises with the pinned. Archived projects sit in a collapsed section
 * after the rest. A typed filter shows its matches flat, archived ones
 * included, and says so with a way to clear it when nothing matches.
 */
export function Projects({
  projects,
  layout,
  now,
  calls,
  filter = '',
  archived = [],
}: ProjectsProps) {
  const unseen = useUnseen((state) => state.unseen)
  const theme = useShownTheme()
  const stamps = useLive((state) => state.thumbnails[theme])
  const captures = { theme, stamps }
  const focused = useStore(projectStore, (state) => state.focused)
  const focusedFolder = useStore(projectStore, (state) => state.folder)
  const focusTarget = useStore(projectStore, (state) => state.focusTarget)
  // Focus goes to a card a write moved out of a closed panel once it draws.
  useEffect(() => {
    if (focusTarget === null) return
    const project = projects.find((record) => record.name === focusTarget)
    const link =
      project &&
      document.querySelector<HTMLElement>(
        `main [data-project-link][href="${CSS.escape(projectHref(project))}"]`,
      )
    if (!link) return
    link.focus()
    projectStore.setState({ focusTarget: null })
  }, [focusTarget, projects])
  const pins = usePins()
  const [opened, setOpened] = useState<ReadonlySet<string>>(new Set())
  const filtering = filter.trim() !== ''
  const shown = filtering
    ? filterProjects([...projects, ...archived], filter)
    : projects
  const entries: HomeEntry[] = filtering
    ? shown.map((project) => ({ kind: 'project', project }))
    : homeEntries(shown)
  const isOpen = (key: string) => layout === 'list' && opened.has(key)
  const toggle = (key: string) =>
    setOpened((current) => {
      const next = new Set(current)
      if (!next.delete(key)) next.add(key)
      return next
    })
  const rover = roverOf(entries, focused, focusedFolder, isOpen)
  const pinnedEntry = (entry: HomeEntry) =>
    entry.kind === 'project'
      ? pins.has(entry.project.name)
      : entry.folder.projects.some((project) => pins.has(project.name))
  // The pinned come first, so the rest start at the first unpinned entry,
  // and a divider sits there only when both groups hold one.
  const firstUnpinned = entries.findIndex((entry) => !pinnedEntry(entry))
  const divideAt = firstUnpinned > 0 ? firstUnpinned : -1
  const item = (project: ProjectRecord) => ({
    project,
    tabbable: project.name === rover,
    calls,
    unseen: unseenUnder(unseen, project.name),
    pinned: pins.has(project.name),
    now,
  })
  const folderUnseen = (projects: readonly ProjectRecord[]) =>
    projects.reduce(
      (sum, project) => sum + unseenUnder(unseen, project.name),
      0,
    )
  return (
    <main className="px-4 py-8 sm:px-12">
      <div className="mb-5 flex flex-wrap items-center gap-3">
        <h1 className="mr-auto text-title">Projects</h1>
        <FilterField />
        <SortMenu />
      </div>
      {entries.length === 0 ? (
        filtering ? (
          <NoMatch filter={filter} />
        ) : null
      ) : layout === 'grid' ? (
        <ul
          onKeyDown={(event) => roveFocus(event, 'grid')}
          className="grid grid-cols-[repeat(auto-fill,minmax(260px,1fr))] gap-5"
        >
          {entries.map((entry, at) => (
            <Fragment key={keyOf(entry)}>
              {at === divideAt ? (
                <li
                  aria-hidden
                  data-pin-divider
                  className="col-span-full h-px bg-border"
                />
              ) : null}
              <DropItem entry={entry} calls={calls}>
                {entry.kind === 'project' ? (
                  <ProjectCard {...item(entry.project)} captures={captures} />
                ) : (
                  <FolderCard
                    folder={entry.folder}
                    tabbable={keyOf(entry) === rover}
                    unseen={folderUnseen(entry.folder.projects)}
                    now={now}
                    calls={calls}
                    captures={captures}
                  />
                )}
              </DropItem>
            </Fragment>
          ))}
        </ul>
      ) : (
        <div className="overflow-hidden rounded-xl border border-border bg-card text-card-foreground">
          <div
            aria-hidden
            className={cn(
              'grid h-9 items-center border-b border-border px-4 text-label text-muted-foreground',
              ROW_COLUMNS,
            )}
          >
            <span />
            <span>Name</span>
            <span className="hidden sm:block">Edited</span>
            <span className="hidden sm:block">Created</span>
          </div>
          <ul onKeyDown={(event) => roveFocus(event, 'list')}>
            {entries.map((entry, at) => (
              <Fragment key={keyOf(entry)}>
                {at === divideAt ? (
                  // Every row already ends on a hairline, so the groups part on a band.
                  <li
                    aria-hidden
                    data-pin-divider
                    className="h-1.5 border-b border-border bg-muted"
                  />
                ) : null}
                <DropItem
                  entry={entry}
                  calls={calls}
                  className="not-last:border-b"
                >
                  {entry.kind === 'project' ? (
                    <ProjectRow {...item(entry.project)} />
                  ) : (
                    <FolderRow
                      folder={entry.folder}
                      open={isOpen(entry.folder.key)}
                      onToggle={() => toggle(entry.folder.key)}
                      tabbable={keyOf(entry) === rover}
                      unseen={folderUnseen(entry.folder.projects)}
                      now={now}
                      calls={calls}
                    >
                      {entry.folder.projects.map((project) => (
                        <DropItem
                          key={project.name}
                          entry={{ kind: 'project', project }}
                          calls={calls}
                          className="not-last:border-b"
                        >
                          <ProjectRow {...item(project)} className="pl-11" />
                        </DropItem>
                      ))}
                    </FolderRow>
                  )}
                </DropItem>
              </Fragment>
            ))}
          </ul>
        </div>
      )}
      {filtering ? null : (
        <Archived
          projects={archived}
          layout={layout}
          now={now}
          calls={calls}
          captures={captures}
        />
      )}
    </main>
  )
}

/** What home shows when a filter matches no project, with the way back to every one. */
function NoMatch({ filter }: { filter: string }) {
  return (
    <div className="flex flex-col items-center gap-3 rounded-xl border border-dashed border-border px-6 py-12 text-center">
      <p className="text-body text-muted-foreground">
        No projects match “{filter.trim()}”.
      </p>
      <button
        type="button"
        onClick={() => setHomeFilter('')}
        className="h-7 rounded-lg border border-border bg-card px-3 font-medium outline-none hover:bg-accent focus-visible:ring-3 focus-visible:ring-ring/50"
      >
        Clear filter
      </button>
    </div>
  )
}

interface DropItemProps {
  entry: HomeEntry
  calls: Structure | undefined
  className?: string
  children: ReactNode
}

/**
 * One card or row as a list item a project drops on, per `22-fix.png`. A
 * project dropped on a project in no folder makes a folder of the two, named
 * and opened for renaming as New folder is, and one dropped on a folder, or
 * on a project in one, files into it. While a project is over it, the item
 * says what the drop does.
 */
function DropItem({ entry, calls, className, children }: DropItemProps) {
  const element = useRef<HTMLLIElement>(null)
  const canWrite = useLive((state) => state.canWrite)
  const project = entry.kind === 'project' ? entry.project : null
  const renamingProject = useRenamingProject(project?.name ?? '') !== null
  const renamingFolder =
    useRenamingFolder(entry.kind === 'folder' ? entry.folder.key : '') !== null
  const target: DropTarget =
    entry.kind === 'folder'
      ? { kind: 'folder', key: entry.folder.key, name: entry.folder.name }
      : {
          kind: 'project',
          name: entry.project.name,
          group: entry.project.group,
        }
  const into = entry.kind === 'folder' ? entry.folder.name : entry.project.group
  const over = useHomeDrag(element, {
    source: project ? { name: project.name, group: project.group } : undefined,
    target,
    enabled: canWrite && !renamingProject && !renamingFolder,
    onDrop: (dropped) => {
      if (into !== null) void fileProjects([dropped], into, calls)
      else if (project) void fileInNewFolder([project.name, dropped], calls)
    },
  })
  return (
    <li
      ref={element}
      data-drop-over={over || undefined}
      className={cn(
        'relative data-drop-over:[&>:first-child]:ring-2 data-drop-over:[&>:first-child]:ring-primary',
        className,
      )}
    >
      {children}
      {over ? (
        <span
          role="status"
          className="pointer-events-none absolute inset-x-3 bottom-3 rounded-md bg-foreground px-2 py-1 text-label text-background shadow-md"
        >
          {into === null
            ? `Drop on ${target.name} to make a folder`
            : `Drop to move into ${into}`}
        </span>
      ) : null}
    </li>
  )
}

/** A folder's key never collides with a project's name, since a name holds no slash. */
function keyOf(entry: HomeEntry): string {
  return entry.kind === 'project'
    ? entry.project.name
    : `folder/${entry.folder.key}`
}

/**
 * The one card or row the tab sequence holds: the focused project where it
 * shows, else the folder holding it or the focused folder, else the first.
 */
function roverOf(
  entries: readonly HomeEntry[],
  focused: string | null,
  focusedFolder: string | null,
  isOpen: (key: string) => boolean,
): string | undefined {
  for (const entry of entries) {
    if (entry.kind === 'project') {
      if (entry.project.name === focused) return focused
      continue
    }
    const holds = entry.folder.projects.some(
      (project) => project.name === focused,
    )
    if (holds && isOpen(entry.folder.key)) return focused ?? undefined
    if (holds || entry.folder.key === focusedFolder) return keyOf(entry)
  }
  return entries[0] && keyOf(entries[0])
}
