import { useEffect, useState } from 'react'

import { Button } from '@/client/components/ui/button'
import { useLive } from '@/client/live/store'
import { shownBox } from '@/shared/frame-device'
import type { FrameRecord } from '@/shared/records/list'

import { screen } from '../geometry/draw'
import {
  followEnteredControls,
  keepControls,
  resetControls,
  useMovedControls,
} from './controls'

/** How far inside the entered frame's bottom right corner the bar sits, in screen pixels. */
const INSET = 12

/**
 * The Keep values bar, drawn in the notes layer, which a press reaches in Play,
 * and binding the entered frame's controls while mounted.
 */
export function KeepBar({
  page,
  frames,
}: {
  page: string
  frames: readonly FrameRecord[]
}) {
  useEffect(() => followEnteredControls(), [])
  const { ref, moved } = useMovedControls()
  const canWrite = useLive((state) => state.canWrite)
  const [keeping, setKeeping] = useState(false)
  const frame = frames.find((candidate) => candidate.ref === ref)
  if (!frame || moved === 0) return null
  // The entered frame draws at its shown box, one screen tall for a page-tall phone.
  const { x, y, width, height } = shownBox(frame)
  return (
    <div className="absolute" style={{ left: x + width, top: y + height }}>
      <div
        data-keep-bar
        role="group"
        aria-label="Moved controls"
        className="pointer-events-auto absolute flex origin-bottom-right items-center gap-2 rounded-[9px] border border-border bg-card py-1.5 pr-2 pl-2.5 text-[11px] whitespace-nowrap text-foreground shadow-lg [transform:scale(calc(1/var(--zoom,1)))]"
        style={{ right: screen(INSET), bottom: screen(INSET) }}
      >
        <span className="text-muted-foreground">
          {moved} {moved === 1 ? 'value' : 'values'} changed
        </span>
        <Button variant="outline" size="xs" onClick={resetControls}>
          Reset
        </Button>
        {canWrite ? (
          <Button
            size="xs"
            aria-disabled={keeping || undefined}
            onClick={() => {
              if (keeping) return
              setKeeping(true)
              void keepControls(page).finally(() => setKeeping(false))
            }}
          >
            Keep values
          </Button>
        ) : null}
      </div>
    </div>
  )
}
