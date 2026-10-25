import { cn } from 'cn'
import { Pin } from 'lucide-react'
import type { KeyboardEvent, ReactNode } from 'react'
import { Link } from 'wouter'
import { useStore } from 'zustand'

import { characterKeysOn } from '@/client/actions/character-keys'
import { findAction, isEnabled } from '@/client/actions/registry'
import { RenameField } from '@/client/components/rename-field'
import { UnseenCount } from '@/client/components/unseen-count'
import { useLive } from '@/client/live/store'
import type { Structure } from '@/client/live/structure'
import { unseenUnder, useUnseen } from '@/client/live/unseen'
import {
  focusProject,
  projectHref,
  projectStore,
  renameProject,
  stopProjectRename,
  useRenamingProject,
} from '@/client/projects/actions'
import { useShownTheme } from '@/client/theme/store'
import type { ProjectRecord } from '@/shared/records/list'

import type { HomeLayout } from './layout'
import { usePins } from './pins'
import { ProjectMenu } from './project-menu'
import { FrameSkeleton } from './skeleton'
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
 * `canon/design/menus/home`. A card's well draws its first page's frames
 * with their captures in the theme shown, and a pinned project carries the
 * pin mark after its name.
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
          {projects.map((project) => (
            <li key={project.name}>
              <ProjectLink
                project={project}
                tabbable={project.name === rover}
                className="block overflow-hidden rounded-xl border border-border bg-card text-card-foreground outline-none hover:ring-2 hover:ring-primary focus-visible:ring-2 focus-visible:ring-primary data-popup-open:ring-2 data-popup-open:ring-primary"
              >
                <span
                  aria-hidden
                  className="m-1.5 block h-[150px] overflow-hidden rounded-lg bg-background p-3.5"
                >
                  <FrameSkeleton
                    project={project}
                    captures={captures}
                    className="size-full"
                  />
                </span>
                <span className="flex flex-col px-3 pt-1.5 pb-3">
                  <ProjectName
                    project={project}
                    calls={calls}
                    type="text-panel"
                    unseen={unseenUnder(unseen, project.name)}
                    pinned={pins.has(project.name)}
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
          <ul onKeyDown={(event) => roveFocus(event, 'list')}>
            {projects.map((project) => (
              <li key={project.name} className="not-last:border-b">
                <ProjectLink
                  project={project}
                  tabbable={project.name === rover}
                  className="grid h-12 grid-cols-[48px_1fr] sm:grid-cols-[48px_1fr_160px_160px] items-center px-4 outline-none hover:bg-accent focus-visible:ring-3 focus-visible:ring-ring/50 focus-visible:ring-inset data-popup-open:ring-2 data-popup-open:ring-primary data-popup-open:ring-inset"
                >
                  <Mini project={project} />
                  <ProjectName
                    project={project}
                    calls={calls}
                    type="font-medium"
                    unseen={unseenUnder(unseen, project.name)}
                    pinned={pins.has(project.name)}
                    className="pr-4"
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

/**
 * Moves focus across the cards by the arrow keys, or h, j, k, and l while
 * single-key shortcuts are on, Up and Down stepping a whole row of the grid
 * as it is laid out, and down the list, with Home and End for the ends. Keys
 * typed into a rename field stay in the field.
 */
function roveFocus(event: KeyboardEvent<HTMLElement>, layout: HomeLayout) {
  const from = event.target
  if (!(from instanceof HTMLElement) || !from.matches(LINK)) return
  const links = [...event.currentTarget.querySelectorAll<HTMLElement>(LINK)]
  const at = links.indexOf(from)
  const step = layout === 'grid' ? columnsOf(links) : 1
  const key = pressedKey(event)
  const to = {
    ArrowLeft: layout === 'grid' ? at - 1 : at,
    ArrowRight: layout === 'grid' ? at + 1 : at,
    ArrowUp: at - step,
    ArrowDown: at + step,
    Home: 0,
    End: links.length - 1,
  }[key]
  if (to === undefined) return
  event.preventDefault()
  links[Math.min(Math.max(to, 0), links.length - 1)]?.focus()
}

/**
 * The arrow a bare h, j, k, or l stands for, or the key itself. These read
 * the Single-key shortcuts switch here, since the cards' own keys never pass
 * through the registry's `press`.
 */
function pressedKey(event: KeyboardEvent<HTMLElement>): string {
  const modified = event.ctrlKey || event.metaKey || event.altKey
  const arrow = VIM_KEYS[event.key]
  return arrow && !modified && characterKeysOn() ? arrow : event.key
}

const VIM_KEYS: Readonly<Record<string, string>> = {
  h: 'ArrowLeft',
  j: 'ArrowDown',
  k: 'ArrowUp',
  l: 'ArrowRight',
}

/** How many cards share the first card's row, as the grid wrapped them. */
function columnsOf(links: readonly HTMLElement[]): number {
  const top = links[0]?.getBoundingClientRect().top
  return Math.max(
    links.filter((link) => link.getBoundingClientRect().top === top).length,
    1,
  )
}

const LINK = '[data-project-link]'

interface ProjectLinkProps {
  project: ProjectRecord
  /** The one card the tab sequence holds, the focused one or else the first. */
  tabbable: boolean
  className: string
  children: ReactNode
}

/**
 * A card or row opening its project, and the menu on a right click or the
 * menu key. F2 renames the focused project and Delete or Backspace deletes
 * it. While its name is a rename field it stops being a link, so the field's
 * clicks and keys stay in the field.
 */
function ProjectLink({
  project,
  tabbable,
  className,
  children,
}: ProjectLinkProps) {
  const renaming = useRenamingProject(project.name) !== null
  if (renaming) return <div className={className}>{children}</div>
  return (
    <ProjectMenu
      project={project.name}
      trigger={
        <Link
          href={projectHref(project)}
          data-project-link
          // One card sits in the tab sequence, so Tab leaves the set in one press.
          tabIndex={tabbable ? 0 : -1}
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
  /** How many of the project's frames an agent changed unseen, counted after the name. */
  unseen: number
  pinned: boolean
  /** Added to the name's line, such as the list cell's gap before Edited. */
  className?: string
}

/**
 * The project's name, or the field renaming it with the reason its last name
 * was refused. The field sits in the name's own line box, so the card or row
 * keeps its height while it is open.
 */
function ProjectName({
  project,
  calls,
  type,
  unseen,
  pinned,
  className,
}: ProjectNameProps) {
  const renaming = useRenamingProject(project.name)
  if (!renaming) {
    return (
      <span className={cn('flex min-w-0 items-center gap-1.5', className)}>
        <span className={cn('truncate', type)} title={project.name}>
          {project.name}
        </span>
        <span className="ml-auto flex items-center gap-1.5">
          {pinned ? (
            <Pin
              role="img"
              aria-label="Pinned"
              className="size-[13px] shrink-0 text-muted-foreground"
            />
          ) : null}
          <UnseenCount count={unseen} />
        </span>
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
      <FrameSkeleton project={project} className="size-full" />
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
