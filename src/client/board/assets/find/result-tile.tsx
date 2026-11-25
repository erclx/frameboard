import type { ReactNode } from 'react'

import type { SaveState } from '../sourcing'

interface ResultTileProps {
  picture: ReactNode
  title: string
  /** The size and license under the title. */
  meta: string
  picked: boolean
  save: SaveState | undefined
  onPick: () => void
}

/** One found result, a toggle that shows it in the preview, marked once it is saved. */
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
        <span className="block truncate px-1.5 pt-[5px] text-label font-normal">
          {title}
        </span>
        <span
          title={meta}
          className="block truncate px-1.5 pb-1.5 text-caption text-muted-foreground"
        >
          {meta}
        </span>
      </button>
    </li>
  )
}

const MARK = {
  saving: 'Saving…',
  saved: 'Saved',
  failed: 'Not saved',
} as const
