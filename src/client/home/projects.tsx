import { cn } from 'cn'
import { Fragment, useState } from 'react'
import { useStore } from 'zustand'

import { useLive } from '@/client/live/store'
import type { Structure } from '@/client/live/structure'
import { unseenUnder, useUnseen } from '@/client/live/unseen'
import { projectStore } from '@/client/projects/actions'
import { useShownTheme } from '@/client/theme/store'
import type { ProjectRecord } from '@/shared/records/list'

import { FolderCard } from './folders/card'
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
}

/**
 * Every project on the board as cards, per `canon/design/home/grid`, or as
 * rows, per `canon/design/home/list`, each opening its board and the menu of
 * `canon/design/menus/home`. A project filed in a folder sits in the folder's
 * card, which opens a panel, or under the folder's row, which opens in place.
 * A pinned project carries the pin mark after its name, and a folder holding
 * one rises with the pinned.
 */
export function Projects({ projects, layout, now, calls }: ProjectsProps) {
  const unseen = useUnseen((state) => state.unseen)
  const theme = useShownTheme()
  const stamps = useLive((state) => state.thumbnails[theme])
  const captures = { theme, stamps }
  const focused = useStore(projectStore, (state) => state.focused)
  const focusedFolder = useStore(projectStore, (state) => state.folder)
  const pins = usePins()
  const [opened, setOpened] = useState<ReadonlySet<string>>(new Set())
  const entries = homeEntries(projects)
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
      <div className="mb-5 flex items-center justify-between gap-3">
        <h1 className="text-title">Projects</h1>
        <SortMenu />
      </div>
      {layout === 'grid' ? (
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
              <li>
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
              </li>
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
                <li className="not-last:border-b">
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
                        <li key={project.name} className="not-last:border-b">
                          <ProjectRow {...item(project)} className="pl-11" />
                        </li>
                      ))}
                    </FolderRow>
                  )}
                </li>
              </Fragment>
            ))}
          </ul>
        </div>
      )}
    </main>
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
