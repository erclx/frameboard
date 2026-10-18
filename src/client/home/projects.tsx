import { Link } from 'wouter'

import { boardUrl } from '@/shared/board-urls'
import type { ProjectRecord } from '@/shared/records/list'

import type { HomeLayout } from './layout'

interface ProjectsProps {
  projects: readonly ProjectRecord[]
  layout: HomeLayout
  /** The time "last edited" counts back from. */
  now: number
}

/**
 * Every project on the board as cards, per `canon/design/home/grid`, or as
 * rows, per `canon/design/home/list`, each opening its board. A card's well
 * stays empty until thumbnails draw the project's frames into it.
 */
export function Projects({ projects, layout, now }: ProjectsProps) {
  return (
    <main className="px-4 py-8 sm:px-12">
      <h1 className="mb-5 text-title">Projects</h1>
      {layout === 'grid' ? (
        <ul className="grid grid-cols-[repeat(auto-fill,minmax(260px,1fr))] gap-5">
          {projects.map((project) => (
            <li key={project.name}>
              <Link
                href={projectHref(project)}
                className="block overflow-hidden rounded-xl border border-border bg-card text-card-foreground outline-none hover:ring-2 hover:ring-primary focus-visible:ring-2 focus-visible:ring-primary"
              >
                <span
                  aria-hidden
                  className="m-1.5 block h-[150px] rounded-lg bg-background"
                />
                <span className="flex flex-col px-3 pt-1.5 pb-3">
                  <span className="truncate text-panel" title={project.name}>
                    {project.name}
                  </span>
                  <Edited project={project} now={now} prefix="Edited " />
                </span>
              </Link>
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
                <Link
                  href={projectHref(project)}
                  className="grid h-12 grid-cols-[48px_1fr] sm:grid-cols-[48px_1fr_160px_160px] items-center px-4 outline-none hover:bg-accent focus-visible:ring-3 focus-visible:ring-ring/50 focus-visible:ring-inset"
                >
                  <Mini />
                  <span className="truncate font-medium" title={project.name}>
                    {project.name}
                  </span>
                  {/* Below sm the row keeps its name, so a narrow window never scrolls sideways. */}
                  <span className="hidden truncate sm:block">
                    <Edited project={project} now={now} prefix="" />
                  </span>
                  <span className="hidden sm:block">
                    <Created project={project} />
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        </div>
      )}
    </main>
  )
}

/** The row's small mark of two frames on a canvas, which a thumbnail later replaces. */
function Mini() {
  return (
    <span
      aria-hidden
      className="relative block h-[22px] w-8 rounded bg-background"
    >
      {/* Frames are white pages in either theme, so the marks are too. */}
      <i className="absolute top-[5px] left-[5px] h-3 w-[9px] bg-white" />
      <i className="absolute top-[5px] left-[17px] h-3 w-[9px] bg-white" />
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

/** A project opens on its first page, or on its own route when it has none. */
function projectHref({ name, pages }: ProjectRecord): string {
  const first = pages[0]
  return first ? boardUrl(name, first.name) : `/p/${encodeURIComponent(name)}`
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
