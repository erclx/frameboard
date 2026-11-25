import type { ReactNode } from 'react'

import { Skeleton } from '@/client/components/ui/skeleton'

import type { SaveState } from './sourcing'

interface ResultTileProps {
  picture: ReactNode
  title: string
  /** The line under the title, as its size and license. */
  meta: string
  picked: boolean
  /** The result's save, which marks the tile, absent for one already in `assets/`. */
  save?: SaveState
  onPick: () => void
}

/** One result of Find or Generate, a toggle that shows it in the preview, marked once it is saved. */
export function ResultTile({
  picture,
  title,
  meta,
  picked,
  save,
  onPick,
}: ResultTileProps) {
  const mark = save && MARK[save.state]
  return (
    <li>
      <button
        type="button"
        aria-pressed={picked}
        onClick={onPick}
        className="relative block w-full overflow-hidden rounded-md bg-muted text-left outline-none hover:bg-accent focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring aria-pressed:ring-2 aria-pressed:ring-primary"
      >
        <span className="block h-24 bg-accent *:size-full">{picture}</span>
        {mark ? (
          <span className="absolute top-[5px] right-[5px] rounded-[5px] bg-card px-1.5 py-0.5 text-caption text-foreground shadow-[0_1px_3px_rgba(0,0,0,.3)]">
            {mark}
          </span>
        ) : null}
        <span className="block h-[38px] px-1.5 py-[5px]">
          <span className="block truncate text-label leading-[15px] font-normal">
            {title}
          </span>
          <span
            title={meta}
            className="block truncate text-caption leading-[13px] text-muted-foreground"
          >
            {meta}
          </span>
        </span>
      </button>
    </li>
  )
}

/** A tile's shape, held grey while its result is on its way. */
export function PendingTile() {
  return (
    <li className="overflow-hidden rounded-md bg-muted">
      <span className="block h-24 bg-accent" />
      <span className="block h-[38px] px-1.5 py-[5px]">
        <Skeleton className="my-[3px] h-2 w-[70%] rounded-[3px] bg-foreground/10" />
        <Skeleton className="my-[3px] h-2 w-[45%] rounded-[3px] bg-foreground/10" />
      </span>
    </li>
  )
}

/** The grid the tiles sit in, four to a row at the dialog's full width. */
export const RESULT_GRID =
  'grid grid-cols-[repeat(auto-fill,minmax(130px,1fr))] gap-2.5'

const MARK = {
  saving: 'Saving…',
  saved: 'Saved',
  failed: 'Not saved',
} as const
