import { cn } from 'cn'
import { Fragment } from 'react'
import { useStore } from 'zustand'

import { useLive } from '@/client/live/store'
import type { Structure } from '@/client/live/structure'
import { unseenUnder, useUnseen } from '@/client/live/unseen'
import { projectStore } from '@/client/projects/actions'
import { useShownTheme } from '@/client/theme/store'
import type { ProjectRecord } from '@/shared/records/list'

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
 * `canon/design/menus/home`. A pinned project carries the pin mark after its
 * name.
 */
export function Projects({ projects, layout, now, calls }: ProjectsProps) {
  const unseen = useUnseen((state) => state.unseen)
  const theme = useShownTheme()
  const stamps = useLive((state) => state.thumbnails[theme])
  const captures = { theme, stamps }
  const focused = useStore(projectStore, (state) => state.focused)
  const pins = usePins()
  const rover = projects.some((project) => project.name === focused)
    ? focused
    : projects[0]?.name
  // The pinned come first, so the rest start at the first unpinned project,
  // and a divider sits there only when both groups hold one.
  const firstUnpinned = projects.findIndex((project) => !pins.has(project.name))
  const divideAt = firstUnpinned > 0 ? firstUnpinned : -1
  const item = (project: ProjectRecord) => ({
    project,
    tabbable: project.name === rover,
    calls,
    unseen: unseenUnder(unseen, project.name),
    pinned: pins.has(project.name),
    now,
  })
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
          {projects.map((project, at) => (
            <Fragment key={project.name}>
              {at === divideAt ? (
                <li
                  aria-hidden
                  data-pin-divider
                  className="col-span-full h-px bg-border"
                />
              ) : null}
              <li>
                <ProjectCard {...item(project)} captures={captures} />
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
            {projects.map((project, at) => (
              <Fragment key={project.name}>
                {at === divideAt ? (
                  // Every row already ends on a hairline, so the groups part on a band.
                  <li
                    aria-hidden
                    data-pin-divider
                    className="h-1.5 border-b border-border bg-muted"
                  />
                ) : null}
                <li className="not-last:border-b">
                  <ProjectRow {...item(project)} />
                </li>
              </Fragment>
            ))}
          </ul>
        </div>
      )}
    </main>
  )
}
