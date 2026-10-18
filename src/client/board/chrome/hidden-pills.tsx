import { PanelLeft } from 'lucide-react'

import { useActions } from '@/client/actions/registry'

import { ActionTooltip } from './action-tooltip'
import { useAuthor } from './author'
import { AvatarMenu } from './avatar-menu'
import { ZoomControl } from './zoom-control'

interface HiddenPillsProps {
  project: string
}

/**
 * What Hide UI keeps of the panels, per `canon/design/shell/hide-ui`: the
 * project name with the button bringing the panels back top left, and the
 * avatar with the zoom level top right.
 */
export function HiddenPills({ project }: HiddenPillsProps) {
  const [hideUi] = useActions(['view.hideUi'])
  const name = useAuthor() ?? null
  return (
    <>
      <div className="absolute top-3 left-3 z-10 flex max-w-[calc(100%-10rem)] items-center gap-1.5 rounded-lg border border-border bg-card py-1 pr-1.5 pl-2.5 text-panel">
        <span className="truncate" title={project}>
          {project}
        </span>
        <ActionTooltip label="Show UI" keys={hideUi?.keys} side="bottom">
          <button
            type="button"
            aria-label="Show UI"
            onClick={() => hideUi?.run()}
            className="grid size-6 shrink-0 place-items-center rounded-md text-muted-foreground outline-none hover:bg-accent hover:text-foreground focus-visible:ring-3 focus-visible:ring-ring/50"
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
