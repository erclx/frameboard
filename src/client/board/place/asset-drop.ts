import { dropTargetForElements } from '@atlaskit/pragmatic-drag-and-drop/adapter/element-adapter'
import { type RefObject, useEffect } from 'react'
import { createStore } from 'zustand/vanilla'

import { liveStore } from '@/client/live/store'
import type { FrameRecord } from '@/shared/records/list'

import { draggedFile } from '../assets/drag'
import type { BoardPoint } from '../notes/pick'
import { placeFile } from './write'

/** A point in the viewport, as a pointer or a native drag reports it. */
export interface ClientPoint {
  clientX: number
  clientY: number
}

/**
 * The board point an Assets tile's drag is over the canvas at, null while
 * none is. A native drag fires no `pointermove`, so the drop line reads it
 * here.
 */
export const tileDragStore = createStore<{ at: BoardPoint | null }>()(() => ({
  at: null,
}))

interface AssetDropOptions {
  /** Off while Play lifts the hit layer. */
  enabled: boolean
  /** The canvas layer holding the frames' iframes. */
  container: HTMLElement | null
  page: string
  /** The page's frames where they draw. */
  frames: () => readonly FrameRecord[]
  toBoard: (point: ClientPoint) => BoardPoint
  /** Lands the dropped file, `placeFile` in the app. */
  place?: typeof placeFile
}

/**
 * Makes the canvas's hit layer a drop target for an Assets tile, placing its
 * file at the gap under the release as the Image tool's click does, while
 * this tab may write. A drag of anything else is not taken. A file dragged
 * from the system is taken and dropped on nothing, so it never opens in
 * place of the board.
 */
export function useAssetDrop(
  target: RefObject<HTMLElement | null>,
  {
    enabled,
    container,
    page,
    frames,
    toBoard,
    place = placeFile,
  }: AssetDropOptions,
): void {
  useEffect(() => {
    const element = target.current
    if (!enabled || !element || !container) return
    const swallowFiles = (event: DragEvent) => {
      if (event.dataTransfer?.types.includes('Files')) event.preventDefault()
    }
    element.addEventListener('dragover', swallowFiles)
    element.addEventListener('drop', swallowFiles)
    const follow = (point: ClientPoint | null) =>
      tileDragStore.setState({ at: point && toBoard(point) })
    const stopTarget = dropTargetForElements({
      element,
      canDrop: ({ source }) =>
        liveStore.getState().canWrite && draggedFile(source.data) !== null,
      onDragEnter: ({ location }) => follow(location.current.input),
      onDrag: ({ location }) => follow(location.current.input),
      onDragLeave: () => follow(null),
      onDrop: ({ source, location }) => {
        follow(null)
        const file = draggedFile(source.data)
        if (!file) return
        void place(
          container,
          page,
          frames(),
          toBoard(location.current.input),
          file,
        )
      },
    })
    return () => {
      stopTarget()
      element.removeEventListener('dragover', swallowFiles)
      element.removeEventListener('drop', swallowFiles)
      follow(null)
    }
  }, [target, enabled, container, page, frames, toBoard, place])
}
