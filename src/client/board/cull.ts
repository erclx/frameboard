import type { FrameRecord } from '@/shared/records/list'

/** The canvas transform: a translate in screen pixels, then a scale. */
export interface View {
  x: number
  y: number
  k: number
}

export interface Size {
  width: number
  height: number
}

/**
 * The refs of frames worth keeping live: those whose box meets the viewport
 * grown by one viewport on every side, so a short pan never shows a
 * placeholder. A linear pass, which stays cheap at the frame counts a page
 * holds.
 */
export function mountedRefs(
  frames: readonly Pick<FrameRecord, 'ref' | 'box'>[],
  view: View,
  size: Size,
): Set<string> {
  const width = size.width / view.k
  const height = size.height / view.k
  const left = -view.x / view.k - width
  const top = -view.y / view.k - height
  const right = left + 3 * width
  const bottom = top + 3 * height

  const refs = new Set<string>()
  for (const { ref, box } of frames) {
    if (
      box.x < right &&
      box.x + box.width > left &&
      box.y < bottom &&
      box.y + box.height > top
    ) {
      refs.add(ref)
    }
  }
  return refs
}
