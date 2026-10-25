import { LucideProvider } from 'lucide-react'
import { useEffect } from 'react'
import { Link, Route, Switch } from 'wouter'

import { watchExpiredLink } from './access/expired-link'
import { ViewOnlyNotice } from './access/notice'
import { SHOW_OFFER } from './board/changes/show'
import { ShowOfferBody } from './board/changes/show-toast'
import { CHANGE_TOAST, ChangeToastBody } from './board/changes/toast'
import { BoardScreen } from './board/screen'
import { buttonVariants } from './components/ui/button'
import { Toaster } from './components/ui/toast'
import { TooltipProvider } from './components/ui/tooltip'
import { Home } from './home/home'
import { useLive } from './live/store'
import { CommandPalette } from './palette/commands'
import { ShortcutsSheet } from './palette/shortcuts'

/** The toasts that draw their own body in the one stack. */
const TOAST_BODIES = {
  [CHANGE_TOAST]: ChangeToastBody,
  [SHOW_OFFER]: ShowOfferBody,
}

/** Every icon at the one stroke weight the references draw. */
const ICON_STROKE = 1.6

/** The board's routes over the live store, which `main.tsx` connects to the server. */
export function App() {
  return (
    <LucideProvider strokeWidth={ICON_STROKE}>
      <TooltipProvider delay={500}>
        <Toaster bodies={TOAST_BODIES}>
          <Shell />
          <CommandPalette />
          <ShortcutsSheet />
        </Toaster>
      </TooltipProvider>
    </LucideProvider>
  )
}

function Shell() {
  const projects = useLive((state) => state.board?.projects)
  const connected = useLive((state) => state.connected)
  useEffect(() => watchExpiredLink(), [])

  return (
    <div className="relative h-svh overflow-auto bg-background text-foreground">
      {projects ? (
        <Switch>
          <Route path="/">
            <Home projects={projects} />
          </Route>
          <Route path="/p/:project/:page">
            {({ project, page }) => (
              <BoardScreen project={project} page={page} />
            )}
          </Route>
          <Route path="/p/:project">
            {({ project }) => <BoardScreen project={project} />}
          </Route>
          <Route>
            <div className="flex h-full flex-col items-center justify-center gap-3 p-6">
              <p className="text-body text-muted-foreground">
                Nothing on the board at this address.
              </p>
              <Link href="/" className={buttonVariants({ variant: 'outline' })}>
                Go home
              </Link>
            </div>
          </Route>
        </Switch>
      ) : (
        <p
          role="status"
          className="flex h-full items-center justify-center text-body text-muted-foreground"
        >
          Connecting to the board
        </p>
      )}
      {projects && !connected ? (
        <p
          role="status"
          className="absolute top-3 left-1/2 -translate-x-1/2 rounded-xl border border-border bg-card px-3 py-1 text-body text-muted-foreground"
        >
          Reconnecting to frameboard serve
        </p>
      ) : null}
      {projects ? <ViewOnlyNotice /> : null}
    </div>
  )
}
