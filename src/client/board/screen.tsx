import {
  Activity,
  startTransition,
  useCallback,
  useEffect,
  useState,
} from 'react'
import { useDefaultLayout } from 'react-resizable-panels'
import { Link, Redirect, useLocation } from 'wouter'
import { useShallow } from 'zustand/react/shallow'

import { buttonVariants } from '@/client/components/ui/button'
import {
  ResizableHandle,
  ResizablePanel,
  ResizablePanelGroup,
} from '@/client/components/ui/resizable'
import {
  identityOf,
  liveStore,
  renamedRef,
  under,
  useLive,
} from '@/client/live/store'
import {
  useHomeAction,
  useNewProjectAction,
  useProjectActions,
} from '@/client/projects/actions'
import { boardUrl } from '@/shared/board-urls'
import type { FrameRecord, SectionRecord } from '@/shared/records/list'

import { useSourcingActions } from './assets/open-dialog'
import { AssetsTab } from './assets/tab'
import { useBoardActions } from './board-actions'
import { Canvas } from './canvas'
import { useChangeActions } from './changes/actions'
import { useCompareActions } from './changes/compare'
import { useFollowActions } from './changes/follow'
import { ChangesToast } from './changes/toast'
import { HiddenPills } from './chrome/hidden-pills'
import { PlayBanner } from './chrome/play-banner'
import { Toolbar } from './chrome/toolbar'
import { useFindActions } from './find/actions'
import { InspectorPanel } from './inspector/panel'
import { usePageActions } from './left-panel/page-actions'
import { LeftPanel } from './left-panel/panel'
import { useAddKitAction } from './left-panel/theme/add-kit'
import { ThemeTab } from './left-panel/theme/tab'
import { useMode } from './mode'
import { LAYOUT_ID, PANEL, panelStorage } from './panels'
import { PresentOverlay } from './present/overlay'
import { usePreviewActions } from './preview/actions'
import { useSectionActions } from './sections/actions'
import { useStructureActions } from './structure/actions'
import { useFrameTool } from './structure/tool'

const NO_FRAMES: readonly FrameRecord[] = []
const NO_SECTIONS: readonly SectionRecord[] = []
const EMPTY: Mounted = { keys: [], shown: '' }

/**
 * The canvases mounted, by page identity in document order, and the one
 * shown. Any other is the page just left, held hidden so its iframes are not
 * torn down in the task answering the switch.
 */
interface Mounted {
  keys: readonly string[]
  shown: string
}

/**
 * Shows `key`, holding the page it replaces. A return to the held page swaps
 * the two in place, and a page new to the list drops any older held one and
 * goes last, since moving an iframe's node reloads it.
 */
function show(mounted: Mounted, key: string): Mounted {
  if (key === '') return { keys: [], shown: '' }
  if (mounted.keys.includes(key)) return { keys: mounted.keys, shown: key }
  const left = mounted.shown === '' ? [] : [mounted.shown]
  return { keys: [...left, key], shown: key }
}

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
  // This project's alone, so a message about another renders nothing here.
  const reloads = useLive(useShallow((state) => under(state.reloads, project)))
  const kept = useLive(useShallow((state) => under(state.kept, project)))
  const findings = useLive(
    useShallow((state) => under(state.findings, project)),
  )
  const claims = useLive(useShallow((state) => under(state.claims, project)))
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
  // A rename keeps the canvas, and a page switch mounts a fresh one unless returning.
  const aliases = useLive((state) => state.aliases)
  const canvasKey = current ? identityOf(aliases, current.ref) : ''
  const [mounted, setMounted] = useState<Mounted>(() => show(EMPTY, canvasKey))
  if (mounted.shown !== canvasKey) setMounted(show(mounted, canvasKey))
  // A transition, so the held page's teardown never lands in a click's task.
  const dropHeld = useCallback((key: string) => {
    startTransition(() =>
      setMounted((latest) =>
        latest.shown === key ? { keys: [key], shown: key } : latest,
      ),
    )
  }, [])
  const [, navigate] = useLocation()
  // Follows a rename in the board's own update, so the old name never shows missing.
  useEffect(() => {
    if (page === undefined) return
    return liveStore.subscribe((state, previous) => {
      const moved = renamedRef(previous, state, `${project}/${page}`)
      if (moved === null) return
      const [nextProject = '', nextPage = ''] = moved.split('/')
      navigate(boardUrl(nextProject, nextPage), { replace: true })
    })
  }, [project, page, navigate])
  const openProject = useCallback(() => project, [project])
  const goHome = useCallback(() => navigate('/'), [navigate])
  useProjectActions(openProject, { onDeleted: goHome })
  useHomeAction(goHome)
  useNewProjectAction(undefined, goHome)
  useBoardActions()
  usePageActions(project, page)
  useAddKitAction()
  useSourcingActions(project)
  useStructureActions(current?.ref ?? '', current?.frames ?? NO_FRAMES)
  useFrameTool()
  useSectionActions(
    current?.ref ?? '',
    current?.frames ?? NO_FRAMES,
    current?.sections ?? NO_SECTIONS,
  )
  useChangeActions()
  useCompareActions()
  useFollowActions()
  useFindActions()
  usePreviewActions()

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
              // Keyed by project, so a search, a chip, and collapsed folders stay with the project they were set in.
              assets={<AssetsTab key={record.name} project={record.name} />}
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
              {mounted.keys.map((key) => {
                const held = key !== canvasKey
                const content = held
                  ? record.pages.find(
                      (candidate) => identityOf(aliases, candidate.ref) === key,
                    )
                  : current
                if (!content) return null
                return (
                  <Activity key={key} mode={held ? 'hidden' : 'visible'}>
                    <Canvas
                      page={content}
                      reloads={reloads}
                      kept={kept}
                      findings={findings}
                      claims={claims}
                      focus={held ? null : focus}
                      onFocused={clearFocus}
                      onLive={() => dropHeld(key)}
                    />
                  </Activity>
                )
              })}
              <Toolbar project={record.name} />
              <ChangesToast />
              <PresentOverlay />
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
          {playing ? (
            <PlayBanner frames={current?.frames ?? NO_FRAMES} />
          ) : null}
          {hideUi ? <HiddenPills project={record} page={page ?? ''} /> : null}
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
            <InspectorPanel open={current?.ref} />
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
