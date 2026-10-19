import { cn } from 'cn'
import { File, Plus, Search, TriangleAlert } from 'lucide-react'
import { useCallback, useRef, useState } from 'react'
import { Link, useLocation } from 'wouter'

import { isEnabled, useActions } from '@/client/actions/registry'
import { RenameField } from '@/client/components/rename-field'
import { useLive } from '@/client/live/store'
import { type Structure, structure } from '@/client/live/structure'
import { boardUrl } from '@/shared/board-urls'
import type { PageRecord } from '@/shared/records/list'

import { ActionTooltip } from '../chrome/action-tooltip'
import { DropLine } from './drop-line'
import {
  deletePage,
  type PageWriteContext,
  renamePage,
  reportRefusal,
  startRename,
  stopRename,
  useRenamingPage,
} from './page-actions'
import { useReorderMonitor, useReorderRow } from './reorder'
import { PanelSection } from './section'

interface PagesListProps {
  pages: readonly PageRecord[]
  /** The name of the page on the canvas. */
  current: string
  /** The server calls a write makes, the board's own when absent. */
  calls?: Structure
}

const LIST = 'pages'

const HEADER_BUTTON =
  'grid size-5 place-items-center rounded-md text-muted-foreground outline-none hover:bg-accent hover:text-foreground focus-visible:ring-3 focus-visible:ring-ring/50 aria-disabled:cursor-not-allowed aria-disabled:opacity-50 aria-disabled:hover:bg-transparent aria-pressed:bg-accent aria-pressed:text-foreground'

/**
 * A project's pages in their saved order, each switching the canvas to it.
 * A tab that may write adds a page, renames one on a double-click or F2,
 * deletes the focused one with Delete, and drags one to a new place. The
 * search filters the list by name and closes on Esc.
 */
export function PagesList({
  pages,
  current,
  calls = structure,
}: PagesListProps) {
  const [, navigate] = useLocation()
  const context = { current, navigate, calls }
  const [add] = useActions(['page.new'])
  const enabled = add ? isEnabled(add) : false
  const canWrite = useLive((state) => state.canWrite)
  const [searching, setSearching] = useState(false)
  const [query, setQuery] = useState('')
  const needle = query.trim().toLowerCase()
  const shown = needle
    ? pages.filter((page) => page.name.toLowerCase().includes(needle))
    : pages

  const move = useCallback(
    (from: number, to: number) => {
      const page = pages[from]
      if (!page) return
      calls
        .movePage(page.ref, to)
        .catch(reportRefusal(`Couldn't move ${page.name}`))
    },
    [pages, calls],
  )
  useReorderMonitor(LIST, move)

  const closeSearch = () => {
    setSearching(false)
    setQuery('')
  }

  return (
    <nav
      aria-labelledby="pages-heading"
      className="flex h-full min-h-0 flex-col"
    >
      <PanelSection id="pages-heading" title="Pages">
        <span className="flex gap-0.5">
          <ActionTooltip label="Search pages">
            <button
              type="button"
              aria-label="Search pages"
              aria-pressed={searching}
              onClick={() => (searching ? closeSearch() : setSearching(true))}
              className={HEADER_BUTTON}
            >
              <Search aria-hidden className="size-[13px]" />
            </button>
          </ActionTooltip>
          <ActionTooltip label={add?.label ?? 'Add page'} keys={add?.keys}>
            <button
              type="button"
              aria-label={add?.label ?? 'Add page'}
              aria-disabled={enabled ? undefined : true}
              onClick={() => {
                if (add && enabled) add.run()
              }}
              className={HEADER_BUTTON}
            >
              <Plus aria-hidden className="size-[13px]" />
            </button>
          </ActionTooltip>
        </span>
      </PanelSection>
      {searching ? (
        <div className="mx-2 mb-1.5 flex h-[26px] shrink-0 items-center gap-1.5 rounded-md bg-muted px-2 ring-[1.5px] ring-primary">
          <Search
            aria-hidden
            className="size-[13px] shrink-0 text-muted-foreground"
          />
          <input
            // The search opens on a click that asks for it, so it takes focus.
            // oxlint-disable-next-line jsx-a11y/no-autofocus
            autoFocus
            aria-label="Search pages"
            value={query}
            spellCheck={false}
            onChange={(event) => setQuery(event.target.value)}
            onKeyDown={(event) => {
              if (event.key !== 'Escape') return
              event.preventDefault()
              event.stopPropagation()
              closeSearch()
            }}
            className="min-w-0 flex-1 bg-transparent text-foreground outline-none"
          />
          <span aria-hidden className="text-muted-foreground">
            Esc
          </span>
        </div>
      ) : null}
      {shown.length === 0 && needle ? (
        <p className="px-3.5 py-1 text-faint">
          No page names match {query.trim()}
        </p>
      ) : (
        <ul className="flex min-h-0 flex-col -mt-1 overflow-y-auto pt-1 pb-0.5">
          {shown.map((page) => (
            <PageRow
              key={page.ref}
              page={page}
              pages={pages}
              context={context}
              needle={needle}
              canWrite={canWrite}
            />
          ))}
        </ul>
      )}
    </nav>
  )
}

interface PageRowProps {
  page: PageRecord
  pages: readonly PageRecord[]
  context: PageWriteContext
  /** The lowercased search, empty when the list is not filtered. */
  needle: string
  canWrite: boolean
}

const ROW =
  'mx-1.5 flex h-[26px] items-center gap-1.5 rounded-md pr-2 pl-2 text-foreground'

function PageRow({ page, pages, context, needle, canWrite }: PageRowProps) {
  const { current } = context
  const row = useRef<HTMLLIElement>(null)
  const renaming = useRenamingPage() === page.ref
  // A filtered list's positions are not the saved order, so it never reorders.
  const edge = useReorderRow(row, {
    list: LIST,
    index: page.index,
    enabled: canWrite && !needle && !renaming,
  })
  const icon = (
    <>
      <span aria-hidden className="w-2.5 shrink-0" />
      <File
        aria-hidden
        className="size-[13px] shrink-0 text-muted-foreground"
      />
    </>
  )

  return (
    <li ref={row} className="relative">
      <DropLine edge={edge} />
      {renaming ? (
        <div className={cn(ROW, page.name === current && 'bg-accent')}>
          {icon}
          <RenameField
            name={page.name}
            label={`Rename page ${page.name}`}
            onCommit={(name) => {
              stopRename()
              void renamePage(page, name, context)
            }}
            onCancel={stopRename}
          />
        </div>
      ) : (
        <Link
          href={boardUrl(page.project, page.name)}
          aria-current={page.name === current ? 'page' : undefined}
          draggable={false}
          onDoubleClick={() => {
            if (canWrite) startRename(page.ref)
          }}
          onKeyDown={(event) => {
            if (!canWrite) return
            if (event.key === 'F2') startRename(page.ref)
            else if (event.key === 'Delete' || event.key === 'Backspace') {
              void deletePage(page, pages, context)
            } else return
            event.preventDefault()
          }}
          className={cn(
            ROW,
            'outline-none hover:bg-accent focus-visible:ring-3 focus-visible:ring-ring/50 focus-visible:ring-inset aria-[current=page]:bg-accent',
          )}
        >
          {icon}
          <span className="min-w-0 flex-1 truncate" title={page.name}>
            <Highlighted name={page.name} needle={needle} />
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
      )}
    </li>
  )
}

/** The name with the first match of the search marked, as `layers/search` draws it. */
function Highlighted({ name, needle }: { name: string; needle: string }) {
  const at = needle ? name.toLowerCase().indexOf(needle) : -1
  if (at < 0) return name
  return (
    <>
      {name.slice(0, at)}
      <mark className="rounded-[2px] bg-primary/30 text-inherit">
        {name.slice(at, at + needle.length)}
      </mark>
      {name.slice(at + needle.length)}
    </>
  )
}
