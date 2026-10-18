import { House } from 'lucide-react'
import { useCallback } from 'react'
import { Link, Redirect } from 'wouter'

import { buttonVariants } from '@/client/components/ui/button'
import { liveStore, useLive } from '@/client/live/store'
import { boardUrl } from '@/shared/board-urls'

import { Canvas } from './canvas'
import { PagesList } from './left-panel/pages-list'

interface BoardScreenProps {
  project: string
  /** Absent on `/p/:project`, which opens the project's first page. */
  page?: string
}

/** One project's board: the home button and pages list beside the page's canvas. */
export function BoardScreen({ project, page }: BoardScreenProps) {
  const record = useLive((state) =>
    state.board?.projects.find((candidate) => candidate.name === project),
  )
  const reloads = useLive((state) => state.reloads)
  const findings = useLive((state) => state.findings)
  const focus = useLive((state) => state.focus)
  const clearFocus = useCallback(() => liveStore.setState({ focus: null }), [])

  if (!record) {
    return <Missing message={`No project ${project} on this board.`} />
  }
  const first = record.pages[0]
  if (page === undefined && first) {
    return <Redirect to={boardUrl(project, first.name)} replace />
  }
  const current = record.pages.find((candidate) => candidate.name === page)

  return (
    <div className="flex h-full">
      {/* Below about 1024px the board hides its panels and the canvas keeps the screen. */}
      <aside className="hidden w-60 shrink-0 flex-col gap-3 border-r border-sidebar-border bg-sidebar py-2 lg:flex">
        <div className="flex items-center gap-1 px-2">
          <Link
            href="/"
            aria-label="Home"
            title="Home"
            className={buttonVariants({ variant: 'ghost', size: 'icon-sm' })}
          >
            <House aria-hidden />
          </Link>
          <span
            className="min-w-0 truncate text-panel text-sidebar-foreground"
            title={record.name}
          >
            {record.name}
          </span>
        </div>
        <PagesList pages={record.pages} current={page ?? ''} />
      </aside>
      <main className="min-w-0 flex-1">
        {current ? (
          <Canvas
            key={current.ref}
            page={current}
            reloads={reloads}
            findings={findings}
            focus={focus}
            onFocused={clearFocus}
          />
        ) : (
          <Missing
            message={
              first
                ? `No page ${page} in ${project}.`
                : `${project} has no pages yet. An agent adds one with frameboard page add <name>.`
            }
          />
        )}
      </main>
    </div>
  )
}

function Missing({ message }: { message: string }) {
  return (
    <div className="flex h-full flex-col items-center justify-center gap-3 p-6 text-center">
      <p className="text-body text-muted-foreground">{message}</p>
      <Link href="/" className={buttonVariants({ variant: 'outline' })}>
        Go home
      </Link>
    </div>
  )
}
