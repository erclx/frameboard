import { PencilLine, Pin } from 'lucide-react'
import {
  type ComponentProps,
  type KeyboardEvent,
  type ReactNode,
  useState,
} from 'react'
import { Link } from 'wouter'

import { findAction, isEnabled } from '@/client/actions/registry'
import { RenameField } from '@/client/components/rename-field'
import { UnseenCount } from '@/client/components/unseen-count'
import { cn } from '@/client/lib/cn'
import { useLive } from '@/client/live/store'
import type { Structure } from '@/client/live/structure'
import {
  focusProject,
  projectHref,
  projectLabel,
  renameProject,
  stopProjectRename,
  useRenamingProject,
} from '@/client/projects/actions'
import { titledFolder } from '@/shared/names'
import type { ProjectRecord } from '@/shared/records/list'

import { ProjectMenu, ProjectMore } from './project-menu'
import { FrameSkeleton } from './skeleton'

/** The thumbnail stamps a card's well draws in the theme shown. */
export type Captures = ComponentProps<typeof FrameSkeleton>['captures']

interface ProjectItemProps {
  project: ProjectRecord
  /** The one card the tab sequence holds, the focused one or else the first. */
  tabbable: boolean
  /** Stands in for the server's structure routes, as a test's server does. */
  calls: Structure | undefined
  /** How many of the project's frames an agent changed unseen, counted after the name. */
  unseen: number
  pinned: boolean
  /** The time "last edited" counts back from. */
  now: number
}

/** The frame a project card and a folder card share. */
export const CARD =
  'block overflow-hidden rounded-xl border border-border bg-card text-card-foreground outline-none hover:border-transparent hover:ring-2 hover:ring-primary focus-visible:border-transparent focus-visible:ring-2 focus-visible:ring-primary data-popup-open:border-transparent data-popup-open:ring-2 data-popup-open:ring-primary in-data-drop-over:border-transparent'

/** The columns a list row and the list's header share. */
export const ROW_COLUMNS =
  'grid-cols-[48px_1fr] sm:grid-cols-[48px_1fr_160px_160px]'

/** The look a list row takes, a project's or a folder's. */
export const ROW =
  'grid h-12 items-center px-4 outline-none hover:bg-accent focus-visible:ring-3 focus-visible:ring-ring/50 focus-visible:ring-inset data-popup-open:ring-2 data-popup-open:ring-primary data-popup-open:ring-inset'

/**
 * A project's card per `canon/design/home/grid`, with its corner buttons per
 * `card-hover-buttons-720`.
 */
export function ProjectCard({
  project,
  tabbable,
  calls,
  unseen,
  pinned,
  now,
  captures,
}: ProjectItemProps & { captures: Captures }) {
  const renaming = useRenamingProject(project.name) !== null
  return (
    // The radius is the card's, since a drop over the card rings this wrapper.
    <div className="group/project relative rounded-xl">
      <ProjectLink
        project={project}
        tabbable={tabbable}
        calls={calls}
        className={CARD}
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
            unseen={unseen}
            pinned={pinned}
            folderHint
          />
          <Edited project={project} now={now} prefix="Edited " />
        </span>
      </ProjectLink>
      {renaming ? null : (
        <ProjectCorner project={project} pinned={pinned} calls={calls} />
      )}
    </div>
  )
}

/** One of the corner's buttons, per `card-hover-buttons-720`. */
const CORNER_BUTTON =
  'grid size-[22px] place-items-center rounded-md bg-card text-foreground shadow-[0_0_0_1px_var(--border)] outline-none hover:bg-accent focus-visible:ring-2 focus-visible:ring-ring/50 data-popup-open:bg-accent'

interface ProjectCornerProps {
  project: ProjectRecord
  pinned: boolean
  calls: Structure | undefined
}

/**
 * A card's corner buttons, outside the tab sequence so one Tab still leaves the
 * cards, revealed by keyboard focus alone, since closing the menu refocuses More.
 */
function ProjectCorner({ project, pinned, calls }: ProjectCornerProps) {
  const canWrite = useLive((state) => state.canWrite)
  const label = projectLabel(project)
  const run = (id: string) => {
    focusProject(project.name)
    const action = findAction(id)
    if (action && isEnabled(action)) action.run()
  }
  return (
    <span className="absolute top-3 right-3 flex gap-[3px] opacity-0 group-hover/project:opacity-100 group-has-focus-visible/project:opacity-100 has-data-popup-open:opacity-100">
      {canWrite ? (
        <button
          type="button"
          aria-label={`Rename ${label}`}
          tabIndex={-1}
          onClick={() => run('project.rename')}
          className={CORNER_BUTTON}
        >
          <PencilLine aria-hidden className="size-3" />
        </button>
      ) : null}
      <button
        type="button"
        aria-label={`Pin ${label}`}
        aria-pressed={pinned}
        tabIndex={-1}
        onClick={() => run('project.pin')}
        className={cn(CORNER_BUTTON, pinned && 'text-primary')}
      >
        <Pin aria-hidden className="size-3" />
      </button>
      <ProjectMore
        project={project.name}
        label={label}
        calls={calls}
        className={CORNER_BUTTON}
      />
    </span>
  )
}

/** A project's row in the list, per `canon/design/home/list`. */
export function ProjectRow({
  project,
  tabbable,
  calls,
  unseen,
  pinned,
  now,
  className,
}: ProjectItemProps & { className?: string }) {
  return (
    <ProjectLink
      project={project}
      tabbable={tabbable}
      calls={calls}
      className={cn(ROW, ROW_COLUMNS, className)}
    >
      <Mini project={project} />
      <ProjectName
        project={project}
        calls={calls}
        type="font-medium"
        unseen={unseen}
        pinned={pinned}
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
  )
}

interface ProjectLinkProps {
  project: ProjectRecord
  tabbable: boolean
  calls: Structure | undefined
  className: string
  children: ReactNode
}

/**
 * A card or row opening its project, no longer a link while renaming, so the
 * field's clicks and keys stay in the field.
 */
function ProjectLink({
  project,
  tabbable,
  calls,
  className,
  children,
}: ProjectLinkProps) {
  const renaming = useRenamingProject(project.name) !== null
  if (renaming) return <div className={className}>{children}</div>
  return (
    <ProjectMenu
      project={project.name}
      calls={calls}
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
  unseen: number
  pinned: boolean
  /** Added to the name's line, such as the list cell's gap before Edited. */
  className?: string
  /** Shows the folder the typed title lands in under the field, which a card has room for. */
  folderHint?: boolean
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
  folderHint = false,
}: ProjectNameProps) {
  const renaming = useRenamingProject(project.name)
  if (!renaming) {
    return (
      <span className={cn('flex min-w-0 items-center gap-1.5', className)}>
        <span className={cn('truncate', type)} title={projectLabel(project)}>
          {projectLabel(project)}
        </span>
        <span className="ml-auto flex items-center gap-1.5">
          {pinned ? (
            <Pin
              role="img"
              aria-label="Pinned"
              className="size-[13px] shrink-0 fill-current text-foreground"
            />
          ) : null}
          <UnseenCount count={unseen} />
        </span>
      </span>
    )
  }
  return (
    <TitleField
      key={renaming.attempt}
      project={project}
      draft={renaming.draft}
      refusal={renaming.refusal}
      calls={calls}
      type={type}
      folderHint={folderHint}
    />
  )
}

interface TitleFieldProps {
  project: ProjectRecord
  draft: string
  refusal: string | null
  calls: Structure | undefined
  type: string
  folderHint: boolean
}

/**
 * The field renaming a project by its title, with the reason its last title
 * was refused under it, or else the folder the typed title lands in, per
 * `name-title-720`. Keyed by the attempt, so a refused field opens afresh.
 */
function TitleField({
  project,
  draft,
  refusal,
  calls,
  type,
  folderHint,
}: TitleFieldProps) {
  const [typed, setTyped] = useState(draft)
  const taken = useLive((state) => state.board?.projects)
  const folder = titledFolder(
    project.name,
    typed,
    (taken ?? []).map((each) => each.name),
  )
  return (
    <span className={cn('flex min-w-0 flex-col', type)}>
      <span className="flex h-lh items-center pl-1.5">
        <RenameField
          name={draft}
          label={`Rename project ${projectLabel(project)}`}
          onCommit={(title) => void renameProject(project.name, title, calls)}
          onCancel={stopProjectRename}
          onType={setTyped}
        />
      </span>
      {refusal ? (
        <span
          role="alert"
          className="mt-1 text-label font-normal text-destructive"
        >
          {refusal}
        </span>
      ) : folderHint ? (
        <span className="mt-1 truncate text-label font-normal text-muted-foreground">
          Folder <code className="font-mono text-[10px]">{folder}</code>
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

/** "Edited" counted back from `now`, the full time on hover. */
export function Edited({
  project,
  now,
  prefix,
}: {
  project: Pick<ProjectRecord, 'modifiedAt'>
  now: number
  prefix: string
}) {
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
function Created({ project }: { project: ProjectRecord }) {
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

/** The local day as `YYYY-MM-DD`, as `canon/design/home/list` prints it. */
function formatDay(date: Date): string {
  const pad = (value: number) => String(value).padStart(2, '0')
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`
}
