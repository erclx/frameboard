import { cn } from 'cn'
import type { KeyboardEvent, ReactNode } from 'react'
import { Link } from 'wouter'

import { findAction, isEnabled } from '@/client/actions/registry'
import { RenameField } from '@/client/components/rename-field'
import type { Structure } from '@/client/live/structure'
import type { ProjectRecord } from '@/shared/records/list'

import type { HomeLayout } from './layout'
import {
  focusProject,
  projectHref,
  renameProject,
  stopProjectRename,
  useRenamingProject,
} from './project-actions'
import { ProjectMenu } from './project-menu'
import { FrameSkeleton } from './skeleton'

interface ProjectsProps {
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
 * `canon/design/menus/home`. A card's well stays empty until thumbnails draw
 * the project's frames into it.
 */
export function Projects({ projects, layout, now, calls }: ProjectsProps) {
  return (
    <main className="px-4 py-8 sm:px-12">
      <h1 className="mb-5 text-title">Projects</h1>
      {layout === 'grid' ? (
        <ul className="grid grid-cols-[repeat(auto-fill,minmax(260px,1fr))] gap-5">
          {projects.map((project) => (
            <li key={project.name}>
              <ProjectLink
                project={project}
                className="block overflow-hidden rounded-xl border border-border bg-card text-card-foreground outline-none hover:ring-2 hover:ring-primary focus-visible:ring-2 focus-visible:ring-primary data-popup-open:ring-2 data-popup-open:ring-primary"
              >
                <span
                  aria-hidden
                  className="m-1.5 block h-[150px] overflow-hidden rounded-lg bg-background p-3.5"
                >
                  <FrameSkeleton project={project} className="size-full" />
                </span>
                <span className="flex flex-col px-3 pt-1.5 pb-3">
                  <ProjectName
                    project={project}
                    calls={calls}
                    type="text-panel"
                  />
                  <Edited project={project} now={now} prefix="Edited " />
                </span>
              </ProjectLink>
            </li>
          ))}
        </ul>
      ) : (
        <div className="overflow-hidden rounded-xl border border-border bg-card text-card-foreground">
          <div
            aria-hidden
            className="grid h-9 grid-cols-[48px_1fr] sm:grid-cols-[48px_1fr_160px_160px] items-center border-b border-border px-4 text-label text-muted-foreground"
          >
            <span />
            <span>Name</span>
            <span className="hidden sm:block">Edited</span>
            <span className="hidden sm:block">Created</span>
          </div>
          <ul>
            {projects.map((project) => (
              <li key={project.name} className="not-last:border-b">
                <ProjectLink
                  project={project}
                  className="grid h-12 grid-cols-[48px_1fr] sm:grid-cols-[48px_1fr_160px_160px] items-center px-4 outline-none hover:bg-accent focus-visible:ring-3 focus-visible:ring-ring/50 focus-visible:ring-inset data-popup-open:ring-2 data-popup-open:ring-primary data-popup-open:ring-inset"
                >
                  <Mini project={project} />
                  <ProjectName
                    project={project}
                    calls={calls}
                    type="font-medium"
                  />
                  {/* Below sm the row keeps its name, so a narrow window never scrolls sideways. */}
                  <span className="hidden truncate sm:block">
                    <Edited project={project} now={now} prefix="" />
                  </span>
                  <span className="hidden sm:block">
                    <Created project={project} />
                  </span>
                </ProjectLink>
              </li>
            ))}
          </ul>
        </div>
      )}
    </main>
  )
}

interface ProjectLinkProps {
  project: ProjectRecord
  className: string
  children: ReactNode
}

/**
 * A card or row opening its project, and the menu on a right click or the
 * menu key. F2 renames the focused project and Delete or Backspace deletes
 * it. While its name is a rename field it stops being a link, so the field's
 * clicks and keys stay in the field.
 */
function ProjectLink({ project, className, children }: ProjectLinkProps) {
  const renaming = useRenamingProject(project.name) !== null
  if (renaming) return <div className={className}>{children}</div>
  return (
    <ProjectMenu
      project={project.name}
      trigger={
        <Link
          href={projectHref(project)}
          onFocus={() => focusProject(project.name)}
          onKeyDown={(event: KeyboardEvent) => {
            const id = CARD_KEYS[event.key]
            if (!id) return
            focusProject(project.name)
            const action = findAction(id)
            if (action && isEnabled(action)) action.run()
            event.preventDefault()
          }}
          className={className}
        >
          {children}
        </Link>
      }
    />
  )
}

/** The actions a key runs on the focused card, Enter opening it as a link does. */
const CARD_KEYS: Readonly<Record<string, string>> = {
  F2: 'project.rename',
  Delete: 'project.delete',
  Backspace: 'project.delete',
}

interface ProjectNameProps {
  project: ProjectRecord
  calls: Structure | undefined
  /** The name's type, which the rename field takes too. */
  type: string
}

/**
 * The project's name, or the field renaming it with the reason its last name
 * was refused. The field sits in the name's own line box, so the card or row
 * keeps its height while it is open.
 */
function ProjectName({ project, calls, type }: ProjectNameProps) {
  const renaming = useRenamingProject(project.name)
  if (!renaming) {
    return (
      <span className={cn('truncate', type)} title={project.name}>
        {project.name}
      </span>
    )
  }
  return (
    <span className={cn('flex min-w-0 flex-col', type)}>
      <span className="flex h-lh items-center pl-1.5">
        <RenameField
          key={renaming.attempt}
          name={renaming.draft}
          label={`Rename project ${project.name}`}
          onCommit={(name) => void renameProject(project.name, name, calls)}
          onCancel={stopProjectRename}
        />
      </span>
      {renaming.refusal ? (
        <span
          role="alert"
          className="mt-1 text-label font-normal text-destructive"
        >
          {renaming.refusal}
        </span>
      ) : null}
    </span>
  )
}

/** The row's small mark, being the card's skeleton at the size of a list row. */
function Mini({ project }: { project: ProjectRecord }) {
  return (
    <span
      aria-hidden
      className="block h-[22px] w-8 overflow-hidden rounded bg-background p-[5px]"
    >
      <FrameSkeleton project={project} fill className="size-full" />
    </span>
  )
}

interface DateProps {
  project: ProjectRecord
}

function Edited({
  project,
  now,
  prefix,
}: DateProps & { now: number; prefix: string }) {
  return (
    <span
      data-edited
      className="truncate text-body text-muted-foreground"
      title={new Date(project.modifiedAt).toLocaleString()}
    >
      {prefix}
      {formatAgo(Date.parse(project.modifiedAt), now)}
    </span>
  )
}

/** The day the project was made, empty for one made before the time was recorded. */
function Created({ project }: DateProps) {
  if (!project.createdAt) return <span />
  const created = new Date(project.createdAt)
  return (
    <time
      dateTime={project.createdAt}
      className="text-body text-muted-foreground"
      title={created.toLocaleString()}
    >
      {formatDay(created)}
    </time>
  )
}

const UNITS: [Intl.RelativeTimeFormatUnit, number][] = [
  ['year', 365 * 24 * 3600],
  ['month', 30 * 24 * 3600],
  ['week', 7 * 24 * 3600],
  ['day', 24 * 3600],
  ['hour', 3600],
  ['minute', 60],
]

function formatAgo(then: number, now: number): string {
  const seconds = Math.max(0, (now - then) / 1000)
  const format = new Intl.RelativeTimeFormat('en', { numeric: 'auto' })
  for (const [unit, size] of UNITS) {
    if (seconds >= size) return format.format(-Math.floor(seconds / size), unit)
  }
  return 'just now'
}

/** The local day as `2026-09-02`, as `canon/design/home/list` prints it. */
function formatDay(date: Date): string {
  const pad = (value: number) => String(value).padStart(2, '0')
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`
}
