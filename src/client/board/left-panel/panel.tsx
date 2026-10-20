import { House, PanelLeft } from 'lucide-react'
import type { ReactNode } from 'react'
import { type LayoutStorage, useDefaultLayout } from 'react-resizable-panels'
import { Link } from 'wouter'

import { useActions } from '@/client/actions/registry'
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

import { ActionTooltip } from '../chrome/action-tooltip'
import { useFind } from '../find/actions'
import { FindPanel } from '../find/panel'
import { LayersList } from './layers-list'
import { PagesList } from './pages-list'

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

/** Where the pages list's height is remembered between loads. */
const SPLIT_ID = 'frameboard.board.pages'

/** Pixels. A row is 26 tall under a 29 heading, and the list starts at eight rows at most. */
const ROW_HEIGHT = 26
const PAGES_MIN = 64
const PAGES_MAX_DEFAULT = 29 + 8 * ROW_HEIGHT

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
  const [hideUi] = useActions(['view.hideUi'])
  const finding = useFind((state) => state.open)
  const split = useDefaultLayout({
    id: SPLIT_ID,
    onlySaveAfterUserInteractions: true,
    storage,
  })
  const pagesHeight = Math.min(
    Math.max(29 + project.pages.length * ROW_HEIGHT + 4, PAGES_MIN),
    PAGES_MAX_DEFAULT,
  )
  const frames =
    project.pages.find((candidate) => candidate.name === page)?.frames ?? []
  return (
    <aside
      aria-label="Pages and layers"
      className="flex h-full min-w-0 flex-col bg-sidebar text-sidebar-foreground"
    >
      <div className="flex h-11 shrink-0 items-center gap-1.5 border-b border-sidebar-border px-2">
        <ActionTooltip label="Home" side="bottom">
          <Link href="/" aria-label="Home" className={ICON_BUTTON}>
            <House aria-hidden className="size-[15px]" />
          </Link>
        </ActionTooltip>
        <span
          className="min-w-0 flex-1 truncate text-panel"
          title={project.name}
        >
          {project.name}
        </span>
        <ActionTooltip label="Hide UI" keys={hideUi?.keys} side="bottom">
          <button
            type="button"
            aria-label="Hide UI"
            onClick={() => hideUi?.run()}
            className={ICON_BUTTON}
          >
            <PanelLeft aria-hidden className="size-[15px]" />
          </button>
        </ActionTooltip>
      </div>
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
              id={SPLIT_ID}
              orientation="vertical"
              defaultLayout={split.defaultLayout}
              onLayoutChanged={split.onLayoutChanged}
            >
              <ResizablePanel
                id="pages"
                defaultSize={pagesHeight}
                minSize={PAGES_MIN}
              >
                <PagesList pages={project.pages} current={page} calls={calls} />
              </ResizablePanel>
              <ResizableHandle
                aria-label="Resize the pages list"
                className="group cursor-row-resize aria-[orientation=horizontal]:h-[9px] border-t border-sidebar-border bg-transparent after:hidden focus-visible:ring-0 data-[separator=active]:border-t-2 data-[separator=active]:border-primary data-[separator=focus]:border-t-2 data-[separator=focus]:border-primary"
              >
                <span
                  aria-hidden
                  className="h-[3px] w-7 rounded-[2px] bg-faint group-data-[separator=active]:bg-primary group-data-[separator=focus]:bg-primary"
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

const ICON_BUTTON =
  'grid size-[26px] shrink-0 place-items-center rounded-md text-muted-foreground outline-none hover:bg-accent hover:text-foreground focus-visible:ring-3 focus-visible:ring-ring/50'
