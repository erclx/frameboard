import { cn } from 'cn'
import { LayoutGrid, Rows3 } from 'lucide-react'
import { type ReactNode, useState } from 'react'
import { Link } from 'wouter'

import { buttonVariants } from '@/client/components/ui/button'
import { boardUrl } from '@/shared/board-urls'
import type { ProjectRecord } from '@/shared/records/list'

type HomeLayout = 'cards' | 'rows'

const LAYOUT_KEY = 'frameboard.home.layout'

interface ProjectsProps {
  projects: readonly ProjectRecord[]
  /** The time "last edited" counts back from. */
  now: number
}

/** Every project on the board as cards or rows, each opening its board. */
export function Projects({ projects, now }: ProjectsProps) {
  const [layout, setLayout] = useState<HomeLayout>(readLayout)

  const choose = (next: HomeLayout) => {
    setLayout(next)
    writeLayout(next)
  }

  return (
    <div className="mx-auto flex w-full max-w-5xl flex-col gap-6 px-4 py-8 sm:px-8">
      <header className="flex items-center justify-between gap-4">
        <h1 className="text-title">Projects</h1>
        <div role="group" aria-label="Layout" className="flex gap-1">
          <LayoutButton
            label="Cards"
            pressed={layout === 'cards'}
            onPress={() => choose('cards')}
          >
            <LayoutGrid aria-hidden />
          </LayoutButton>
          <LayoutButton
            label="Rows"
            pressed={layout === 'rows'}
            onPress={() => choose('rows')}
          >
            <Rows3 aria-hidden />
          </LayoutButton>
        </div>
      </header>
      {projects.length === 0 ? (
        <p className="text-body text-muted-foreground">
          No projects yet. An agent starts one with frameboard project add
          &lt;name&gt;.
        </p>
      ) : layout === 'cards' ? (
        <ul className="grid grid-cols-[repeat(auto-fill,minmax(200px,1fr))] gap-4">
          {projects.map((project) => (
            <li key={project.name}>
              <Link
                href={projectHref(project)}
                className="flex h-full flex-col gap-1 rounded-lg border border-border bg-card p-4 text-card-foreground outline-none hover:bg-accent focus-visible:ring-3 focus-visible:ring-ring/50"
              >
                <span className="truncate text-panel" title={project.name}>
                  {project.name}
                </span>
                <Edited project={project} now={now} />
              </Link>
            </li>
          ))}
        </ul>
      ) : (
        <ul className="flex flex-col overflow-hidden rounded-lg border border-border bg-card">
          {projects.map((project) => (
            <li key={project.name} className="not-last:border-b">
              <Link
                href={projectHref(project)}
                className="flex items-center justify-between gap-4 px-4 py-3 text-card-foreground outline-none hover:bg-accent focus-visible:ring-3 focus-visible:ring-ring/50 focus-visible:ring-inset"
              >
                <span className="truncate text-panel" title={project.name}>
                  {project.name}
                </span>
                <Edited project={project} now={now} />
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}

interface LayoutButtonProps {
  label: string
  pressed: boolean
  onPress: () => void
  children: ReactNode
}

function LayoutButton({
  label,
  pressed,
  onPress,
  children,
}: LayoutButtonProps) {
  return (
    <button
      type="button"
      aria-label={label}
      aria-pressed={pressed}
      title={label}
      onClick={onPress}
      className={cn(
        buttonVariants({ variant: 'ghost', size: 'icon-sm' }),
        pressed && 'bg-accent text-foreground',
      )}
    >
      {children}
    </button>
  )
}

function Edited({ project, now }: { project: ProjectRecord; now: number }) {
  return (
    <span
      data-edited
      className="shrink-0 text-body text-muted-foreground"
      title={new Date(project.modifiedAt).toLocaleString()}
    >
      Edited {formatAgo(Date.parse(project.modifiedAt), now)}
    </span>
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

function readLayout(): HomeLayout {
  try {
    return localStorage.getItem(LAYOUT_KEY) === 'rows' ? 'rows' : 'cards'
  } catch {
    return 'cards'
  }
}

function writeLayout(layout: HomeLayout): void {
  try {
    localStorage.setItem(LAYOUT_KEY, layout)
  } catch {
    // A browser refusing storage keeps the choice for this visit alone.
  }
}
