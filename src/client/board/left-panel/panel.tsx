import { type ReactNode, useRef } from 'react'
import {
  type LayoutStorage,
  useDefaultLayout,
  usePanelRef,
} from 'react-resizable-panels'

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
 * Pixels. A row is 26 tall under a 29 heading, with 12 of room under the last
 * row so the divider never crowds it, and the list starts at eight rows at most.
 */
const ROW_HEIGHT = 26
const PAGES_ROOM = 12
const PAGES_MIN = 64
const PAGES_MAX_DEFAULT = 29 + 8 * ROW_HEIGHT + PAGES_ROOM

const TAB =
  'h-6 rounded-[5px] border-0 text-xs font-medium text-muted-foreground data-active:bg-card data-active:text-foreground data-active:shadow-none data-active:ring-1 data-active:ring-border dark:data-active:bg-card'

/**
 * The left panel of `canon/design/toolbar/floating`: the header with the
 * way home, the project name, and Hide UI, then the Design, Theme, and Assets
 * tabs, Design holding the pages and the page's layers. While find is open,
 * its panel stands in for the tabs under the same header.
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
  // The reset is the panel's own resize rather than a drag, which the
  // layout hook would skip saving, so the change it causes is marked as the
  // developer's.
  const resetting = useRef(false)
  const pagesHeight = Math.min(
    Math.max(29 + project.pages.length * ROW_HEIGHT + PAGES_ROOM, PAGES_MIN),
    PAGES_MAX_DEFAULT,
  )
  const frames =
    project.pages.find((candidate) => candidate.name === page)?.frames ?? []
  return (
    <aside
      aria-label="Pages and layers"
      className="flex h-full min-w-0 flex-col bg-sidebar text-sidebar-foreground"
    >
      <ProjectHeader project={project} page={page} calls={calls} />
      {finding ? (
        <FindPanel project={project.name} page={page} />
      ) : (
        <Tabs defaultValue="design" className="min-h-0 flex-1 gap-0">
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
                  // A split already at its fit changes no layout, so no
                  // change would arrive to clear the mark.
                  if (
                    !panel ||
                    Math.abs(panel.getSize().inPixels - pagesHeight) < 1
                  ) {
                    return
                  }
                  resetting.current = true
                  panel.resize(pagesHeight)
                }}
                className="group cursor-row-resize aria-[orientation=horizontal]:h-[9px] border-t border-sidebar-border bg-transparent after:hidden focus-visible:ring-0 data-[separator=active]:border-t-2 data-[separator=active]:border-faint focus-visible:border-t-2 focus-visible:border-primary"
              >
                <span
                  aria-hidden
                  className="h-[3px] w-7 rounded-[2px] bg-faint group-data-[separator=active]:bg-muted-foreground group-focus-visible:bg-primary"
                />
              </ResizableHandle>
              <ResizablePanel id="layers" minSize={PAGES_MIN}>
                <LayersList frames={frames} calls={calls} />
              </ResizablePanel>
            </ResizablePanelGroup>
          </TabsContent>
          <TabsContent value="theme" className="min-h-0 text-xs">
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
