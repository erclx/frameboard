import { House, PanelLeft } from 'lucide-react'
import { Link } from 'wouter'

import { useActions } from '@/client/actions/registry'
import type { Structure } from '@/client/live/structure'
import type { ProjectRecord } from '@/shared/records/list'

import { ProjectTitle } from '../left-panel/project-header'
import { ActionTooltip } from './action-tooltip'
import { useAuthor } from './author'
import { AvatarMenu } from './avatar-menu'
import { ZoomControl } from './zoom-control'

interface HiddenPillsProps {
  project: ProjectRecord
  /** The page on the canvas, which a rename keeps the board on. */
  page: string
  /** The server calls a rename writes through, the board's own when absent. */
  calls?: Structure
}

/**
 * What Hide UI keeps of the panels, per `canon/design/shell/hide-ui`: the
 * way home, the project name with the header's own menu, and the button
 * bringing the panels back top left, and the avatar with the zoom level top
 * right.
 */
export function HiddenPills({ project, page, calls }: HiddenPillsProps) {
  const [hideUi] = useActions(['view.hideUi'])
  const name = useAuthor() ?? null
  return (
    <>
      <div className="absolute top-3 left-3 z-10 flex max-w-[calc(100%-10rem)] items-center gap-1.5 rounded-lg border border-border bg-card py-1 pr-1.5 pl-2.5 shadow-[0_2px_8px_rgba(0,0,0,.12)]">
        <ActionTooltip label="Home" side="bottom">
          <Link href="/" aria-label="Home" className={ICON_BUTTON}>
            <House aria-hidden className="size-[15px]" />
          </Link>
        </ActionTooltip>
        <span aria-hidden className="h-4 w-px shrink-0 bg-border" />
        <ProjectTitle project={project} page={page} calls={calls} />
        <ActionTooltip label="Show UI" keys={hideUi?.keys} side="bottom">
          <button
            type="button"
            aria-label="Show UI"
            onClick={() => hideUi?.run()}
            className={ICON_BUTTON}
          >
            <PanelLeft aria-hidden className="size-[15px]" />
          </button>
        </ActionTooltip>
      </div>
      <div className="absolute top-3 right-3 z-10 flex h-[34px] items-center gap-1.5 rounded-lg border border-border bg-card pr-2.5 pl-1.5">
        <AvatarMenu name={name} align="end" />
        <ZoomControl className="text-foreground" />
      </div>
    </>
  )
}

const ICON_BUTTON =
  'grid size-6 shrink-0 place-items-center rounded-md text-muted-foreground outline-none hover:bg-accent hover:text-foreground focus-visible:ring-3 focus-visible:ring-ring/50'
