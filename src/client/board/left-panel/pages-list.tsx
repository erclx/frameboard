import { File, Plus, TriangleAlert } from 'lucide-react'
import { Link } from 'wouter'

import { isEnabled, useActions } from '@/client/actions/registry'
import { boardUrl } from '@/shared/board-urls'
import type { PageRecord } from '@/shared/records/list'

import { ActionTooltip } from '../chrome/action-tooltip'
import { PanelSection } from './section'

interface PagesListProps {
  pages: readonly PageRecord[]
  /** The name of the page on the canvas. */
  current: string
}

/**
 * A project's pages in their saved order, each switching the canvas to it.
 * The add button waits on the row that registers `page.new`.
 */
export function PagesList({ pages, current }: PagesListProps) {
  const [add] = useActions(['page.new'])
  const enabled = add ? isEnabled(add) : false
  return (
    <nav aria-labelledby="pages-heading" className="flex min-h-0 flex-col">
      <PanelSection id="pages-heading" title="Pages">
        <ActionTooltip label={add?.label ?? 'Add page'} keys={add?.keys}>
          <button
            type="button"
            aria-label={add?.label ?? 'Add page'}
            aria-disabled={enabled ? undefined : true}
            onClick={() => {
              if (add && enabled) add.run()
            }}
            className="grid size-5 place-items-center rounded-md text-muted-foreground outline-none hover:bg-accent hover:text-foreground focus-visible:ring-3 focus-visible:ring-ring/50 aria-disabled:cursor-not-allowed aria-disabled:opacity-50 aria-disabled:hover:bg-transparent"
          >
            <Plus aria-hidden className="size-[13px]" />
          </button>
        </ActionTooltip>
      </PanelSection>
      <ul className="flex min-h-0 flex-col overflow-y-auto pb-0.5">
        {pages.map((page) => (
          <li key={page.ref}>
            <Link
              href={boardUrl(page.project, page.name)}
              aria-current={page.name === current ? 'page' : undefined}
              className="mx-1.5 flex h-[26px] items-center gap-1.5 rounded-md pr-2 pl-2 text-foreground outline-none hover:bg-accent focus-visible:ring-3 focus-visible:ring-ring/50 focus-visible:ring-inset aria-[current=page]:bg-accent"
            >
              <span aria-hidden className="w-2.5 shrink-0" />
              <File
                aria-hidden
                className="size-[13px] shrink-0 text-muted-foreground"
              />
              <span className="min-w-0 flex-1 truncate" title={page.name}>
                {page.name}
              </span>
              {page.layoutError ? (
                <TriangleAlert
                  role="img"
                  aria-label="Layout does not read"
                  className="size-3.5 shrink-0 text-note"
                >
                  <title>Layout does not read</title>
                </TriangleAlert>
              ) : null}
            </Link>
          </li>
        ))}
      </ul>
    </nav>
  )
}
