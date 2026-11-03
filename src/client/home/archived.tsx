import { cn } from 'cn'
import { Archive, ChevronRight } from 'lucide-react'
import { useState } from 'react'
import { useStore } from 'zustand'

import type { Structure } from '@/client/live/structure'
import { unseenUnder, useUnseen } from '@/client/live/unseen'
import { projectStore } from '@/client/projects/actions'
import type { ProjectRecord } from '@/shared/records/list'

import type { HomeLayout } from './layout'
import { usePins } from './pins'
import { type Captures, ProjectCard, ProjectRow } from './project-card'
import { roveFocus } from './rove'

const OPEN_KEY = 'frameboard.home.archivedOpen'

interface ArchivedProps {
  /** In the order shown, which the arrow keys and the tab stop follow. */
  projects: readonly ProjectRecord[]
  layout: HomeLayout
  now: number
  calls: Structure | undefined
  captures: Captures
}

/**
 * The archived projects after every other one, collapsed under a header
 * naming their count, which opens them as cards or rows in the layout shown.
 * Whether it is open is remembered for the next visit. Each card's menu reads
 * Restore in place of Archive. It shows nothing while no project is archived.
 */
export function Archived({
  projects,
  layout,
  now,
  calls,
  captures,
}: ArchivedProps) {
  const [open, setOpen] = useState(readOpen)
  const unseen = useUnseen((state) => state.unseen)
  const focused = useStore(projectStore, (state) => state.focused)
  const pins = usePins()
  if (projects.length === 0) return null
  const rover = projects.some((project) => project.name === focused)
    ? focused
    : projects[0]?.name
  const item = (project: ProjectRecord) => ({
    project,
    tabbable: project.name === rover,
    calls,
    unseen: unseenUnder(unseen, project.name),
    pinned: pins.has(project.name),
    now,
  })
  const toggle = () => {
    setOpen(!open)
    writeOpen(!open)
  }
  return (
    <section aria-labelledby="home-archived" className="mt-8">
      <h2 className="mb-4">
        <button
          id="home-archived"
          type="button"
          aria-expanded={open}
          onClick={toggle}
          className="flex h-7 items-center gap-1.5 rounded-lg pr-2.5 pl-1 font-medium text-muted-foreground outline-none hover:bg-accent hover:text-foreground focus-visible:ring-3 focus-visible:ring-ring/50"
        >
          <ChevronRight
            aria-hidden
            className={cn(
              'size-4 transition-transform motion-reduce:transition-none',
              open && 'rotate-90',
            )}
          />
          <Archive aria-hidden className="size-3.5" />
          Archived
          <span className="rounded-full bg-muted px-[7px] text-label">
            {projects.length}
          </span>
        </button>
      </h2>
      {!open ? null : layout === 'grid' ? (
        <ul
          aria-label="Archived projects"
          onKeyDown={(event) => roveFocus(event, 'grid')}
          className="grid grid-cols-[repeat(auto-fill,minmax(260px,1fr))] gap-5"
        >
          {projects.map((project) => (
            <li key={project.name}>
              <ProjectCard {...item(project)} captures={captures} />
            </li>
          ))}
        </ul>
      ) : (
        <ul
          aria-label="Archived projects"
          onKeyDown={(event) => roveFocus(event, 'list')}
          className="overflow-hidden rounded-xl border border-border bg-card text-card-foreground"
        >
          {projects.map((project) => (
            <li key={project.name} className="not-last:border-b">
              <ProjectRow {...item(project)} />
            </li>
          ))}
        </ul>
      )}
    </section>
  )
}

function readOpen(): boolean {
  try {
    return localStorage.getItem(OPEN_KEY) === 'true'
  } catch {
    return false
  }
}

function writeOpen(open: boolean): void {
  try {
    localStorage.setItem(OPEN_KEY, String(open))
  } catch {
    // A browser refusing storage keeps the section's state for this visit alone.
  }
}
