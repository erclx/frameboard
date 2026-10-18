import { House, PanelLeft } from 'lucide-react'
import type { ReactNode } from 'react'
import { Link } from 'wouter'

import { useActions } from '@/client/actions/registry'
import {
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from '@/client/components/ui/tabs'
import type { ProjectRecord } from '@/shared/records/list'

import { ActionTooltip } from '../chrome/action-tooltip'
import { LayersList } from './layers-list'
import { PagesList } from './pages-list'

interface LeftPanelProps {
  project: ProjectRecord
  /** The name of the page on the canvas, empty when the route names none. */
  page: string
  /** The Theme tab's body, absent until the theme row supplies it, which leaves the tab disabled. */
  theme?: ReactNode
}

const TAB =
  'h-6 rounded-[5px] border-0 font-medium text-body text-muted-foreground data-active:bg-card data-active:text-foreground data-active:shadow-none data-active:ring-1 data-active:ring-border dark:data-active:bg-card'

/**
 * The left panel of `canon/design/toolbar/floating`: the header with the
 * way home, the project name, and Hide UI, then the Design and Theme tabs,
 * Design holding the pages and the page's layers.
 */
export function LeftPanel({ project, page, theme }: LeftPanelProps) {
  const [hideUi] = useActions(['view.hideUi'])
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
      <Tabs defaultValue="design" className="min-h-0 flex-1 gap-0">
        <TabsList className="m-2 h-7 w-auto shrink-0 rounded-[7px] p-0.5">
          <TabsTrigger value="design" className={TAB}>
            Design
          </TabsTrigger>
          <TabsTrigger value="theme" disabled={!theme} className={TAB}>
            Theme
          </TabsTrigger>
        </TabsList>
        <TabsContent value="design" className="flex min-h-0 flex-col text-body">
          <PagesList pages={project.pages} current={page} />
          <hr className="my-1.5 border-sidebar-border" />
          <LayersList frames={frames} />
        </TabsContent>
        <TabsContent value="theme" className="min-h-0 text-body">
          {theme}
        </TabsContent>
      </Tabs>
    </aside>
  )
}

const ICON_BUTTON =
  'grid size-[26px] shrink-0 place-items-center rounded-md text-muted-foreground outline-none hover:bg-accent hover:text-foreground focus-visible:ring-3 focus-visible:ring-ring/50'
