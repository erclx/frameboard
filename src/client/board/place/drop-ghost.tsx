import { useStore } from 'zustand'

import { screen, sizeLabel } from '../geometry/draw'
import { OVERLAY_Z } from '../geometry/overlay'
import { tileDragStore } from './asset-drop'

/**
 * The frame a dragged tile would make over bare canvas, drawn once its size is
 * read and never over a frame, where the drop line shows the gap instead.
 */
export function DropGhost() {
  const ghost = useStore(tileDragStore, (state) => state.ghost)
  if (!ghost) return null
  const { box, name, hugsHeight } = ghost
  return (
    <div
      data-drop-ghost
      aria-hidden
      className="pointer-events-none absolute grid place-items-center border-dashed border-primary bg-primary/10 text-primary"
      style={{
        left: box.x,
        top: box.y,
        width: box.width,
        height: box.height,
        borderWidth: screen(1.5),
        borderRadius: screen(2),
        zIndex: OVERLAY_Z,
      }}
    >
      <span className="absolute bottom-full left-0 origin-bottom-left pb-1 text-label font-normal whitespace-nowrap [transform:scale(calc(1/var(--zoom,1)))]">
        {name}
      </span>
      <span className="text-label font-medium whitespace-nowrap [transform:scale(calc(1/var(--zoom,1)))]">
        New frame · {sizeLabel(box, hugsHeight ? 'height' : undefined)}
      </span>
    </div>
  )
}
