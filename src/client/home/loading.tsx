import { ArrowUpDown, ChevronDown } from 'lucide-react'
import { useState } from 'react'

import { Skeleton } from '@/client/components/ui/skeleton'
import { cn } from '@/client/lib/cn'

import { FilterField } from './filter-field'
import { HomeHeader } from './header'
import { readLayout } from './layout'
import { ROW_COLUMNS } from './project-card'
import { MOST_PLACEHOLDERS, readShownCount } from './shown-count'
import { type HomeSort, readOrder } from './sort'

/** Each placeholder's key, a fixed name per slot, since the slots never reorder. */
const SLOTS = Array.from(
  { length: MOST_PLACEHOLDERS },
  (_, at) => `slot-${at + 1}`,
)

/** The frame's loading pulse, the one looped motion a waiting block takes. */
const PULSE = 'motion-safe:animate-frame-loading'

const SORT_LABELS: Readonly<Record<HomeSort, string>> = {
  edited: 'Last edited',
  created: 'Created',
  name: 'Name',
}

/**
 * Home while the board loads, reading the remembered layout without
 * registering its actions, so the controls stay disabled until `Home` takes over.
 */
export function HomeLoading() {
  const [layout] = useState(readLayout)
  const [order] = useState(readOrder)
  const [slots] = useState(() => SLOTS.slice(0, readShownCount()))
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
        {layout === 'grid' ? (
          <GridLoading slots={slots} />
        ) : (
          <ListLoading slots={slots} />
        )}
      </main>
      <p role="status" className="sr-only">
        Connecting to the board
      </p>
    </div>
  )
}

function GridLoading({ slots }: { slots: readonly string[] }) {
  return (
    <ul
      aria-hidden
      className="grid grid-cols-[repeat(auto-fill,minmax(260px,1fr))] gap-5"
    >
      {slots.map((key) => (
        <li
          key={key}
          data-placeholder
          className="rounded-xl border border-border bg-card"
        >
          <Skeleton className={cn('m-1.5 h-[150px] rounded-lg', PULSE)} />
          {/* Each bar sits in a row one line of the real card's type tall, so the card lands at the shell's height. */}
          <span className="flex flex-col px-3 pt-1.5 pb-3">
            <span className="flex h-lh items-center text-panel">
              <Skeleton className={cn('h-3 w-1/2 rounded-sm', PULSE)} />
            </span>
            <span className="flex h-lh items-center text-body">
              <Skeleton className={cn('h-2.5 w-1/3 rounded-sm', PULSE)} />
            </span>
          </span>
        </li>
      ))}
    </ul>
  )
}

function ListLoading({ slots }: { slots: readonly string[] }) {
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
        {slots.map((key) => (
          <li
            key={key}
            data-placeholder
            className={cn(
              'grid h-12 items-center px-4 not-last:border-b',
              ROW_COLUMNS,
            )}
          >
            <Skeleton className={cn('h-7 w-9 rounded-sm', PULSE)} />
            <Skeleton className={cn('h-3 w-40 max-w-full rounded-sm', PULSE)} />
            <Skeleton
              className={cn('hidden h-2.5 w-20 rounded-sm sm:block', PULSE)}
            />
            <Skeleton
              className={cn('hidden h-2.5 w-20 rounded-sm sm:block', PULSE)}
            />
          </li>
        ))}
      </ul>
    </div>
  )
}
