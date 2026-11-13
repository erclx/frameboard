import { useStore } from 'zustand'

import { screen, sizeLabel } from '../geometry/draw'
import { OVERLAY_Z } from '../geometry/overlay'
import { tileDragStore } from './asset-drop'

/**
 * The frame a dragged Assets tile would make where it is, drawn while the
 * tile is over bare canvas: a dashed box the file's size holding
 * `New frame` and that size, with the frame's name above it where a frame's
 * label sits. It draws nothing over a frame, where the drop line shows the
 * gap instead, and nothing until the file's size is read.
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
