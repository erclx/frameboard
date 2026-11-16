import { ArrowUpDown, ChevronDown } from 'lucide-react'
import { useState } from 'react'

import { Skeleton } from '@/client/components/ui/skeleton'
import { cn } from '@/client/lib/cn'

import { FilterField } from './filter-field'
import { HomeHeader } from './header'
import { readLayout } from './layout'
import { ROW_COLUMNS } from './project-card'
import { type HomeSort, readOrder } from './sort'

/** No storage holds the last visit's project count, so the shell draws a row's worth. */
const PLACEHOLDERS = ['one', 'two', 'three', 'four'] as const

const SORT_LABELS: Readonly<Record<HomeSort, string>> = {
  edited: 'Last edited',
  created: 'Created',
  name: 'Name',
}

/**
 * Home while the board loads: the real header and Projects row, with grey
 * cards or rows in the layout the last visit left. It reads the remembered
 * layout and sort without registering their actions, so the switch, New
 * project, and Sort show disabled until `Home` takes over.
 */
export function HomeLoading() {
  const [layout] = useState(readLayout)
  const [order] = useState(readOrder)
  return (
    <div className="flex min-h-full flex-col text-body">
      <HomeHeader hasProjects />
      <main className="px-4 py-8 sm:px-12">
        <div className="mb-5 flex flex-wrap items-center gap-3">
          <h1 className="mr-auto text-title">Projects</h1>
          <FilterField />
          <button
            type="button"
            aria-disabled
            className="flex h-7 cursor-not-allowed items-center gap-1.5 rounded-lg pr-2 pl-2.5 font-medium text-foreground opacity-50 outline-none focus-visible:ring-3 focus-visible:ring-ring/50"
          >
            <ArrowUpDown
              aria-hidden
              className="size-3.5 text-muted-foreground"
            />
            Sort: {SORT_LABELS[order.by]}
            <ChevronDown aria-hidden className="size-3 text-muted-foreground" />
          </button>
        </div>
        {layout === 'grid' ? <GridLoading /> : <ListLoading />}
      </main>
      <p role="status" className="sr-only">
        Connecting to the board
      </p>
    </div>
  )
}

function GridLoading() {
  return (
    <ul
      aria-hidden
      className="grid grid-cols-[repeat(auto-fill,minmax(260px,1fr))] gap-5"
    >
      {PLACEHOLDERS.map((key) => (
        <li
          key={key}
          data-placeholder
          className="rounded-xl border border-border bg-card"
        >
          <Skeleton className="m-1.5 h-[150px] rounded-lg" />
          {/* Each bar sits in a row one line of the real card's type tall, so the card lands at the shell's height. */}
          <span className="flex flex-col px-3 pt-1.5 pb-3">
            <span className="flex h-lh items-center text-panel">
              <Skeleton className="h-3 w-1/2 rounded-sm" />
            </span>
            <span className="flex h-lh items-center text-body">
              <Skeleton className="h-2.5 w-1/3 rounded-sm" />
            </span>
          </span>
        </li>
      ))}
    </ul>
  )
}

function ListLoading() {
  return (
    <div className="overflow-hidden rounded-xl border border-border bg-card text-card-foreground">
      <div
        aria-hidden
        className={cn(
          'grid h-9 items-center border-b border-border px-4 text-label text-muted-foreground',
          ROW_COLUMNS,
        )}
      >
        <span />
        <span>Name</span>
        <span className="hidden sm:block">Edited</span>
        <span className="hidden sm:block">Created</span>
      </div>
      <ul aria-hidden>
        {PLACEHOLDERS.map((key) => (
          <li
            key={key}
            data-placeholder
            className={cn(
              'grid h-12 items-center px-4 not-last:border-b',
              ROW_COLUMNS,
            )}
          >
            <Skeleton className="h-7 w-9 rounded-sm" />
            <Skeleton className="h-3 w-40 max-w-full rounded-sm" />
            <Skeleton className="hidden h-2.5 w-20 rounded-sm sm:block" />
            <Skeleton className="hidden h-2.5 w-20 rounded-sm sm:block" />
          </li>
        ))}
      </ul>
    </div>
  )
}
