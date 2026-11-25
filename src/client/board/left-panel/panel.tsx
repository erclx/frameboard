import { type ReactNode, useEffect, useRef } from 'react'
import {
  type LayoutStorage,
  type PanelImperativeHandle,
  useDefaultLayout,
  usePanelRef,
} from 'react-resizable-panels'
import { useStore } from 'zustand'

import {
  ResizableHandle,
  ResizablePanel,
  ResizablePanelGroup,
} from '@/client/components/ui/resizable'
import {
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from '@/client/components/ui/tabs'
import type { Structure } from '@/client/live/structure'
import type { ProjectRecord } from '@/shared/records/list'

import { useFind } from '../find/actions'
import { FindPanel } from '../find/panel'
import { LayersList } from './layers-list'
import { PagesList } from './pages-list'
import { ProjectHeader } from './project-header'
import { leftTabStore } from './tab-store'

interface LeftPanelProps {
  project: ProjectRecord
  /** The name of the page on the canvas, empty when the route names none. */
  page: string
  /** The Theme tab's body, absent until the theme row supplies it, which leaves the tab disabled. */
  theme?: ReactNode
  /** The Assets tab's body, absent until supplied, which leaves the tab disabled. */
  assets?: ReactNode
  /** Where the divider between pages and layers remembers its place, the browser's storage when absent. */
  storage?: LayoutStorage
  /** The server calls the pages list writes through, the board's own when absent. */
  calls?: Structure
}

/** Where a project's pages list height is remembered between loads, one per project since page counts differ. */
function splitId(project: string): string {
  return `frameboard.board.pages.${project}`
}

/**
 * Pixels. A new split opens at four to eight rows, a drag may go down to
 * `PAGES_MIN`, and a double-click fits every page above `LAYERS_FLOOR`.
 */
const ROW_HEIGHT = 26
const PAGES_GAP = 7
const PAGES_ROOM = 12
const PAGES_MIN = 64
const LAYERS_FLOOR = 29 + 3 * ROW_HEIGHT

function rowsHeight(rows: number): number {
  return 29 + PAGES_GAP + rows * ROW_HEIGHT + PAGES_ROOM
}

/**
 * Every page's rows, capped by the height the two panels share as read at
 * the call, so a resized window caps it afresh.
 */
function everyPageHeight(
  pages: number,
  split: {
    pages: PanelImperativeHandle | null
    layers: PanelImperativeHandle | null
  },
): number {
  const shared =
    (split.pages?.getSize().inPixels ?? 0) +
    (split.layers?.getSize().inPixels ?? 0)
  return Math.max(
    Math.min(rowsHeight(Math.max(pages, 4)), shared - LAYERS_FLOOR),
    PAGES_MIN,
  )
}

const TAB =
  'h-6 rounded-[5px] border-0 text-xs font-medium text-muted-foreground data-active:bg-card data-active:text-foreground data-active:shadow-none data-active:ring-1 data-active:ring-border dark:data-active:bg-card'

/**
 * The left panel of `canon/design/toolbar/floating`, find's panel standing in
 * for the tabs while it is open.
 */
export function LeftPanel({
  project,
  page,
  theme,
  assets,
  storage,
  calls,
}: LeftPanelProps) {
  const finding = useFind((state) => state.open)
  const id = splitId(project.name)
  const split = useDefaultLayout({
    id,
    onlySaveAfterUserInteractions: true,
    storage,
  })
  const pagesPanel = usePanelRef()
  const layersPanel = usePanelRef()
  // Marked as the developer's, since the layout hook skips saving a non-drag resize.
  const resetting = useRef(false)
  const pagesHeight = rowsHeight(Math.min(Math.max(project.pages.length, 4), 8))
  // A page add grows a shorter split to its fit, and a list showing every page keeps showing all.
  const tab = useStore(leftTabStore, (state) => state.tab)
  const setTab = (next: string) => {
    if (next === 'design' || next === 'theme' || next === 'assets') {
      leftTabStore.setState({ tab: next })
    }
  }
  // A reset in a mount effect's cleanup would undo the palette's tab under StrictMode's remount.
  useEffect(() => {
    const { project: shown } = leftTabStore.getState()
    if (shown === project.name) return
    leftTabStore.setState({
      project: project.name,
      ...(shown === null ? {} : { tab: 'design' }),
    })
  }, [project.name])
  const splitShown = !finding && tab === 'design'
  const counted = useRef({ project: project.name, pages: project.pages.length })
  useEffect(() => {
    if (!splitShown) return
    const frame = requestAnimationFrame(() => {
      const panel = pagesPanel.current
      if (!panel) return
      const before = counted.current
      counted.current = { project: project.name, pages: project.pages.length }
      if (
        before.project !== project.name ||
        project.pages.length <= before.pages
      )
        return
      const size = panel.getSize().inPixels
      const showedEvery = size > rowsHeight(before.pages) - 1
      const target = showedEvery
        ? everyPageHeight(project.pages.length, {
            pages: panel,
            layers: layersPanel.current,
          })
        : pagesHeight
      if (size > target - 1) return
      resetting.current = true
      panel.resize(target)
    })
    return () => cancelAnimationFrame(frame)
  }, [
    splitShown,
    project.name,
    project.pages.length,
    pagesHeight,
    pagesPanel,
    layersPanel,
  ])
  const shown = project.pages.find((candidate) => candidate.name === page)
  const frames = shown?.frames ?? []
  return (
    <aside
      aria-label="Pages and layers"
      className="flex h-full min-w-0 flex-col bg-sidebar text-sidebar-foreground"
    >
      <ProjectHeader project={project} page={page} calls={calls} />
      {finding ? (
        <FindPanel project={project.name} page={page} />
      ) : (
        <Tabs
          value={tab}
          onValueChange={(value) => setTab(String(value))}
          className="min-h-0 flex-1 gap-0"
        >
          <TabsList className="m-2 h-7 w-auto shrink-0 rounded-[7px] p-0.5">
            <TabsTrigger value="design" className={TAB}>
              Design
            </TabsTrigger>
            <TabsTrigger value="theme" disabled={!theme} className={TAB}>
              Theme
            </TabsTrigger>
            <TabsTrigger value="assets" disabled={!assets} className={TAB}>
              Assets
            </TabsTrigger>
          </TabsList>
          <TabsContent value="design" className="flex min-h-0 flex-col text-xs">
            <ResizablePanelGroup
              key={id}
              id={id}
              orientation="vertical"
              defaultLayout={split.defaultLayout}
              onLayoutChanged={(layout, meta) => {
                split.onLayoutChanged(
                  layout,
                  resetting.current
                    ? { ...meta, isUserInteraction: true }
                    : meta,
                )
                resetting.current = false
              }}
            >
              <ResizablePanel
                id="pages"
                panelRef={pagesPanel}
                defaultSize={pagesHeight}
                minSize={PAGES_MIN}
              >
                <PagesList pages={project.pages} current={page} calls={calls} />
              </ResizablePanel>
              <ResizableHandle
                aria-label="Resize the pages list"
                disableDoubleClick
                onDoubleClick={() => {
                  const panel = pagesPanel.current
                  if (!panel) return
                  const target = everyPageHeight(project.pages.length, {
                    pages: panel,
                    layers: layersPanel.current,
                  })
                  // Already at its fit, no change would arrive to clear the mark.
                  if (Math.abs(panel.getSize().inPixels - target) < 1) return
                  resetting.current = true
                  panel.resize(target)
                }}
                className="group cursor-row-resize aria-[orientation=horizontal]:h-[9px] border-t border-sidebar-border bg-transparent after:hidden focus-visible:ring-0 data-[separator=active]:border-t-2 data-[separator=active]:border-faint focus-visible:border-t-2 focus-visible:border-primary"
              >
                <span
                  aria-hidden
                  className="h-[3px] w-7 rounded-[2px] bg-faint group-data-[separator=active]:bg-muted-foreground group-focus-visible:bg-primary"
                />
              </ResizableHandle>
              <ResizablePanel
                id="layers"
                panelRef={layersPanel}
                minSize={PAGES_MIN}
              >
                <LayersList
                  shown={shown?.ref}
                  frames={frames}
                  sections={shown?.sections}
                  calls={calls}
                />
              </ResizablePanel>
            </ResizablePanelGroup>
          </TabsContent>
          <TabsContent
            value="theme"
            // Relative, so a tip's hidden node scrolls with the tab rather than stretching the panel.
            // Filled, since a scroll layer with no fill loses its text's subpixel smoothing.
            className="relative min-h-0 overflow-y-auto bg-sidebar text-xs"
          >
            {theme}
          </TabsContent>
          <TabsContent value="assets" className="min-h-0 text-xs">
            {assets}
          </TabsContent>
        </Tabs>
      )}
    </aside>
  )
}
