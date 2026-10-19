import { useCallback } from 'react'
import { useDefaultLayout } from 'react-resizable-panels'
import { Link, Redirect } from 'wouter'

import { buttonVariants } from '@/client/components/ui/button'
import {
  ResizableHandle,
  ResizablePanel,
  ResizablePanelGroup,
} from '@/client/components/ui/resizable'
import { liveStore, useLive } from '@/client/live/store'
import { boardUrl } from '@/shared/board-urls'
import type { FrameRecord } from '@/shared/records/list'

import { AssetsTab } from './assets/tab'
import { useBoardActions } from './board-actions'
import { Canvas } from './canvas'
import { HiddenPills } from './chrome/hidden-pills'
import { PlayBanner } from './chrome/play-banner'
import { Toolbar } from './chrome/toolbar'
import { InspectorPanel } from './inspector/panel'
import { usePageActions } from './left-panel/page-actions'
import { LeftPanel } from './left-panel/panel'
import { ThemeTab } from './left-panel/theme-tab'
import { useMode } from './mode'
import { useStructureActions } from './structure/actions'
import { useFrameTool } from './structure/tool'

/** Pixels, since a bare string reads as percent and 300 would mean 300 percent. */
const PANEL = { defaultSize: 240, minSize: 200, maxSize: 400 } as const

const NO_FRAMES: readonly FrameRecord[] = []

/** Where the panel widths are remembered between loads. */
const LAYOUT_ID = 'frameboard.board.panels'

interface BoardScreenProps {
  project: string
  /** Absent on `/p/:project`, which opens the project's first page. */
  page?: string
}

/**
 * One project's board: the resizable left panel, canvas, and inspector,
 * with the toolbar floating over the canvas. Hide UI drops both panels and
 * leaves two pills, and Play keeps them.
 */
export function BoardScreen({ project, page }: BoardScreenProps) {
  const record = useLive((state) =>
    state.board?.projects.find((candidate) => candidate.name === project),
  )
  const reloads = useLive((state) => state.reloads)
  const findings = useLive((state) => state.findings)
  const claims = useLive((state) => state.claims)
  const focus = useLive((state) => state.focus)
  const clearFocus = useCallback(() => liveStore.setState({ focus: null }), [])
  const hideUi = useMode((state) => state.hideUi)
  const playing = useMode((state) => state.mode === 'play')
  const layout = useDefaultLayout({
    id: LAYOUT_ID,
    // Hide UI renders the canvas alone, so the shown layout keeps its own record.
    panelIds: hideUi ? ['canvas'] : ['left', 'canvas', 'right'],
    onlySaveAfterUserInteractions: true,
    storage: panelStorage,
  })
  const current = record?.pages.find((candidate) => candidate.name === page)
  useBoardActions()
  usePageActions(project, page)
  useStructureActions(current?.ref ?? '', current?.frames ?? NO_FRAMES)
  useFrameTool()

  if (!record) {
    return <Missing message={`No project ${project} on this board.`} />
  }
  const first = record.pages[0]
  if (page === undefined && first) {
    return <Redirect to={boardUrl(project, first.name)} replace />
  }

  return (
    <ResizablePanelGroup
      id="board"
      className="text-body"
      defaultLayout={layout.defaultLayout}
      onLayoutChanged={layout.onLayoutChanged}
    >
      {hideUi ? null : (
        <>
          <ResizablePanel
            id="left"
            {...PANEL}
            groupResizeBehavior="preserve-pixel-size"
          >
            <LeftPanel
              project={record}
              page={page ?? ''}
              theme={<ThemeTab project={record.name} />}
              assets={<AssetsTab project={record.name} />}
              storage={panelStorage}
            />
          </ResizablePanel>
          <ResizableHandle aria-label="Resize the left panel" />
        </>
      )}
      <ResizablePanel id="canvas">
        <main className="relative size-full min-w-0">
          {current ? (
            <>
              <Canvas
                key={current.ref}
                page={current}
                reloads={reloads}
                findings={findings}
                claims={claims}
                focus={focus}
                onFocused={clearFocus}
              />
              <Toolbar />
            </>
          ) : (
            <Missing
              message={
                first
                  ? `No page ${page} in ${project}.`
                  : `${project} has no pages yet. An agent adds one with frameboard page add <name>.`
              }
            />
          )}
          {playing ? <PlayBanner /> : null}
          {hideUi ? <HiddenPills project={record.name} /> : null}
        </main>
      </ResizablePanel>
      {hideUi ? null : (
        <>
          <ResizableHandle aria-label="Resize the inspector" />
          <ResizablePanel
            id="right"
            {...PANEL}
            groupResizeBehavior="preserve-pixel-size"
          >
            <InspectorPanel />
          </ResizablePanel>
        </>
      )}
    </ResizablePanelGroup>
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

/** A browser refusing storage keeps the widths for this visit alone. */
const panelStorage = {
  getItem: (key: string): string | null => {
    try {
      return localStorage.getItem(key)
    } catch {
      return null
    }
  },
  setItem: (key: string, value: string): void => {
    try {
      localStorage.setItem(key, value)
    } catch {
      // Nothing to keep the widths in, so they last until the tab closes.
    }
  },
}
