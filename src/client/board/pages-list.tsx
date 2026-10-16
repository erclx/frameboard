import { TriangleAlert } from 'lucide-react'
import { Link } from 'wouter'

import { boardUrl } from '@/shared/board-urls'
import type { PageRecord } from '@/shared/records/list'

interface PagesListProps {
  pages: readonly PageRecord[]
  /** The name of the page on the canvas. */
  current: string
}

/** A project's pages in their saved order, each switching the canvas to it. */
export function PagesList({ pages, current }: PagesListProps) {
  return (
    <nav aria-label="Pages" className="flex min-h-0 flex-col gap-1">
      <h2 className="px-2 text-label text-muted-foreground">Pages</h2>
      <ul className="flex min-h-0 flex-col gap-px overflow-y-auto p-1">
        {pages.map((page) => (
          <li key={page.ref}>
            <Link
              href={boardUrl(page.project, page.name)}
              aria-current={page.name === current ? 'page' : undefined}
              className="flex h-7 items-center gap-2 rounded-md px-2 text-body text-sidebar-foreground outline-none hover:bg-accent focus-visible:ring-3 focus-visible:ring-ring/50 aria-[current=page]:bg-accent aria-[current=page]:font-semibold"
            >
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
