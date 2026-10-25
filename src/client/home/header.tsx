import { cn } from 'cn'
import { LayoutGrid, List, Moon, Plus, Sun } from 'lucide-react'
import type { ReactNode } from 'react'

import { type Action, isEnabled, useActions } from '@/client/actions/registry'

const IDS = [
  'home.layoutGrid',
  'home.layoutList',
  'project.new',
  'theme.toggle',
] as const

interface HomeHeaderProps {
  /** False on an empty board, which keeps the bar to the mark and the theme. */
  hasProjects: boolean
}

/**
 * The bar across the home view, per `canon/design/home/grid`: the mark, the
 * grid and list switch, New project, and the theme toggle. New project and
 * the theme wait on the rows that register `project.new` and `theme.toggle`.
 */
export function HomeHeader({ hasProjects }: HomeHeaderProps) {
  const [grid, list, newProject, theme] = useActions(IDS)
  return (
    <header className="flex h-14 shrink-0 items-center gap-3 border-b border-border bg-card px-4 sm:px-6">
      <span className="flex flex-1 items-center gap-2 text-base font-semibold">
        <Mark />
        Frameboard
      </span>
      {hasProjects ? (
        <>
          <div
            role="group"
            aria-label="Layout"
            className="flex rounded-lg bg-muted p-0.5"
          >
            <LayoutButton action={grid} label="Grid">
              <LayoutGrid aria-hidden className="size-3.5" />
            </LayoutButton>
            <LayoutButton action={list} label="List">
              <List aria-hidden className="size-3.5" />
            </LayoutButton>
          </div>
          <NewProjectButton action={newProject} compact />
        </>
      ) : null}
      <button
        type="button"
        aria-label={theme?.label ?? 'Theme'}
        title={theme?.label ?? 'Theme'}
        {...pressable(theme)}
        className="grid size-[26px] place-items-center rounded-md text-muted-foreground outline-none hover:bg-accent hover:text-foreground focus-visible:ring-3 focus-visible:ring-ring/50 aria-disabled:cursor-not-allowed aria-disabled:opacity-50 aria-disabled:hover:bg-transparent"
      >
        <Sun aria-hidden className="size-[15px] dark:hidden" />
        <Moon aria-hidden className="hidden size-[15px] dark:block" />
      </button>
    </header>
  )
}

/** The New project button, shared by the header and the empty home. */
export function NewProjectButton({
  action,
  className,
  compact = false,
}: {
  action: Action | undefined
  className?: string
  /** Drops the label below `sm`, where the header has no room for it. */
  compact?: boolean
}) {
  return (
    <button
      type="button"
      aria-label="New project"
      {...pressable(action)}
      className={cn(
        'flex h-[30px] items-center gap-1.5 rounded-lg bg-primary px-3 font-medium text-primary-foreground outline-none hover:bg-primary/90 focus-visible:ring-3 focus-visible:ring-ring/50 aria-disabled:cursor-not-allowed aria-disabled:opacity-50 aria-disabled:hover:bg-primary',
        className,
      )}
    >
      <Plus aria-hidden className="size-3.5" />
      <span className={cn('whitespace-nowrap', compact && 'hidden sm:inline')}>
        New project
      </span>
    </button>
  )
}

interface LayoutButtonProps {
  action: Action | undefined
  label: string
  children: ReactNode
}

function LayoutButton({ action, label, children }: LayoutButtonProps) {
  const on = action?.checked?.() ?? false
  return (
    <button
      type="button"
      aria-label={label}
      title={label}
      aria-pressed={on}
      {...pressable(action)}
      className={cn(
        'grid h-[26px] w-7 place-items-center rounded-md text-muted-foreground outline-none hover:text-foreground focus-visible:ring-3 focus-visible:ring-ring/50',
        on && 'bg-card text-foreground ring-1 ring-border',
      )}
    >
      {children}
    </button>
  )
}

/** A button's disabled mark and click for an action that may not be registered yet. */
function pressable(action: Action | undefined) {
  const enabled = action ? isEnabled(action) : false
  return {
    'aria-disabled': enabled ? undefined : true,
    onClick: () => {
      if (action && enabled) action.run()
    },
  }
}

/**
 * Mark 5c, as `src/client/public/icon.svg` draws it, in the chrome's own
 * colors. Its body sits 1.5px below the box's center at 24px, so it rises by
 * that much to center the wordmark on the body rather than on the box.
 */
function Mark() {
  return (
    <svg
      aria-hidden
      viewBox="0 0 64 64"
      className="size-6 -translate-y-[1.5px]"
    >
      <rect
        x="4"
        y="12"
        width="48"
        height="48"
        rx="12"
        className="fill-primary"
      />
      <rect
        x="34"
        y="4"
        width="26"
        height="26"
        rx="7"
        strokeWidth="4"
        className="fill-foreground stroke-card"
      />
    </svg>
  )
}
