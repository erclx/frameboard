import {
  House,
  ListChevronsUpDown,
  PanelLeft,
  Plus,
  Search,
} from 'lucide-react'
import type { ReactNode } from 'react'
import { useDefaultLayout } from 'react-resizable-panels'
import { Link } from 'wouter'
import { useStore } from 'zustand'

import {
  ResizableHandle,
  ResizablePanel,
  ResizablePanelGroup,
} from '@/client/components/ui/resizable'
import { Skeleton } from '@/client/components/ui/skeleton'
import { Tabs, TabsList, TabsTrigger } from '@/client/components/ui/tabs'

import { useAuthor, useAuthorSource } from './chrome/author'
import { AvatarMenu } from './chrome/avatar-menu'
import { Toolbar } from './chrome/toolbar'
import { ZoomControl } from './chrome/zoom-control'
import { INSPECTOR_TABS, inspectorTabStore } from './inspector/tab-store'
import { PanelSection } from './left-panel/section'
import { useMode } from './mode'
import { LAYOUT_ID, PANEL, panelStorage } from './panels'

// The panels' own trigger classes, so the shell's strips match the real ones.
const TAB =
  'h-6 rounded-[5px] border-0 text-xs font-medium text-muted-foreground data-active:bg-card data-active:text-foreground data-active:shadow-none data-active:ring-1 data-active:ring-border dark:data-active:bg-card'

const ICON_BUTTON =
  'grid size-[26px] shrink-0 place-items-center rounded-md text-muted-foreground outline-none hover:bg-accent hover:text-foreground focus-visible:ring-3 focus-visible:ring-ring/50 aria-disabled:cursor-not-allowed aria-disabled:opacity-50 aria-disabled:hover:bg-transparent'

const INSPECTOR_LABELS = {
  design: 'Design',
  slides: 'Slides',
  export: 'Export',
} as const

/**
 * Where the left panel's divider sits by default, the height the real split
 * opens at for a project of four pages or fewer.
 */
const PAGES_HEIGHT = 152

/**
 * A board page while the board loads, its controls disabled and its menus
 * held shut until `BoardScreen` takes over, since the swap remounts the chrome.
 */
export function BoardLoading({ project }: { project: string }) {
  const hideUi = useMode((state) => state.hideUi)
  const layout = useDefaultLayout({
    id: LAYOUT_ID,
    panelIds: hideUi ? ['canvas'] : ['left', 'canvas', 'right'],
    onlySaveAfterUserInteractions: true,
    storage: panelStorage,
  })
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
            <LeftLoading project={project} />
          </ResizablePanel>
          <ResizableHandle aria-label="Resize the left panel" />
        </>
      )}
      <ResizablePanel id="canvas">
        <main className="relative size-full min-w-0">
          <Skeleton
            data-placeholder
            className="absolute top-[40%] left-1/2 aspect-[8/5] w-[min(320px,60%)] -translate-1/2 rounded-sm bg-border"
          />
          <p
            role="status"
            className="absolute top-3 left-1/2 -translate-x-1/2 rounded-xl border border-border bg-card px-3 py-1 whitespace-nowrap text-muted-foreground"
          >
            Connecting to the board
          </p>
          <Toolbar menusDisabled />
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
            <InspectorLoading />
          </ResizablePanel>
        </>
      )}
    </ResizablePanelGroup>
  )
}

function LeftLoading({ project }: { project: string }) {
  return (
    <aside
      aria-label="Pages and layers"
      className="flex h-full min-w-0 flex-col bg-sidebar text-sidebar-foreground"
    >
      <div className="flex h-11 shrink-0 items-center gap-1.5 border-b border-sidebar-border px-2">
        <Link href="/" aria-label="Home" className={ICON_BUTTON}>
          <House aria-hidden className="size-[15px]" />
        </Link>
        <span className="min-w-0 flex-1 truncate px-1 -ml-1 text-panel">
          {project}
        </span>
        <button
          type="button"
          aria-label="Hide UI"
          aria-disabled
          className={ICON_BUTTON}
        >
          <PanelLeft aria-hidden className="size-[15px]" />
        </button>
      </div>
      <Tabs value="design" className="min-h-0 flex-1 gap-0">
        <TabsList className="m-2 h-7 w-auto shrink-0 rounded-[7px] p-0.5">
          <TabsTrigger value="design" disabled className={TAB}>
            Design
          </TabsTrigger>
          <TabsTrigger value="theme" disabled className={TAB}>
            Theme
          </TabsTrigger>
          <TabsTrigger value="assets" disabled className={TAB}>
            Assets
          </TabsTrigger>
        </TabsList>
        <div className="flex min-h-0 flex-1 flex-col text-xs">
          <div
            className="flex shrink-0 flex-col"
            style={{ height: PAGES_HEIGHT }}
          >
            <PanelSection id="pages-heading" title="Pages">
              <span className="flex gap-0.5">
                <HeaderButton label="Search pages">
                  <Search aria-hidden className="size-[13px]" />
                </HeaderButton>
                <HeaderButton label="Add page">
                  <Plus aria-hidden className="size-[13px]" />
                </HeaderButton>
              </span>
            </PanelSection>
            <Rows />
          </div>
          <div className="h-[9px] shrink-0 border-t border-sidebar-border" />
          <PanelSection id="layers-heading" title="Layers">
            <HeaderButton label="Collapse all layers">
              <ListChevronsUpDown aria-hidden className="size-[15px]" />
            </HeaderButton>
          </PanelSection>
          <Rows />
        </div>
      </Tabs>
    </aside>
  )
}

function InspectorLoading() {
  const name = useAuthor()
  const source = useAuthorSource()
  const tab = useStore(inspectorTabStore, (state) => state.tab)
  return (
    <aside
      aria-label="Inspector"
      className="flex h-full min-w-0 flex-col bg-sidebar text-body text-sidebar-foreground"
    >
      <div className="flex h-11 shrink-0 items-center justify-between border-b border-sidebar-border px-3">
        <AvatarMenu name={name} source={source} disabled />
        <ZoomControl disabled />
      </div>
      <Tabs value={tab} className="gap-0">
        <TabsList className="m-2 h-7 w-auto shrink-0 rounded-[7px] p-0.5">
          {INSPECTOR_TABS.map((one) => (
            <TabsTrigger key={one} value={one} disabled className={TAB}>
              {INSPECTOR_LABELS[one]}
            </TabsTrigger>
          ))}
        </TabsList>
      </Tabs>
      <Rows />
    </aside>
  )
}

/** A Pages or Layers heading's button, disabled until the lists it acts on load. */
function HeaderButton({
  label,
  children,
}: {
  label: string
  children: ReactNode
}) {
  return (
    <button
      type="button"
      aria-label={label}
      aria-disabled
      className="group/target grid size-6 place-items-center text-muted-foreground outline-none aria-disabled:cursor-not-allowed aria-disabled:opacity-50"
    >
      <span className="grid size-5 place-items-center rounded-md group-focus-visible/target:ring-3 group-focus-visible/target:ring-ring/50">
        {children}
      </span>
    </button>
  )
}

/** Two grey rows, since no storage holds how many the last visit drew. */
function Rows(): ReactNode {
  return (
    <div aria-hidden className="flex flex-col gap-2.5 px-3 pt-2 pb-3">
      <Skeleton data-placeholder className="h-3 w-3/4 rounded-sm" />
      <Skeleton data-placeholder className="h-3 w-1/2 rounded-sm" />
    </div>
  )
}
