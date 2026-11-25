import { dropTargetForElements } from '@atlaskit/pragmatic-drag-and-drop/adapter/element-adapter'
import { type RefObject, useEffect } from 'react'
import { createStore } from 'zustand/vanilla'

import { liveStore } from '@/client/live/store'
import { nextFreeName } from '@/shared/names'
import type { FrameRecord } from '@/shared/records/list'

import { assetUrl } from '../assets/describe'
import { draggedFile, type PlaceableFile } from '../assets/drag'
import type { Box } from '../geometry/box'
import type { BoardPoint } from '../notes/pick'
import { type AssetSize, naturalSize } from './asset-size'
import { fileFrameBox, fileFrameName, placeFile, placeFileFrame } from './write'

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
export const tileDragStore = createStore<{
  at: BoardPoint | null
  /** The frame a drop would make, while the tile is over bare canvas and its file's size is read. */
  ghost: DropGhost | null
}>()(() => ({ at: null, ghost: null }))

/** The frame a tile or a carried element dropped on bare canvas would make, as the ghost draws it. */
export interface DropGhost {
  box: Box
  /** Null while the board cannot tell what the frame will be named. */
  name: string | null
  /** The sides the frame takes from its content, an audio's height and both of an element's. */
  hugging?: 'height' | 'both'
}

interface AssetDropOptions {
  /** Off while Play lifts the hit layer. */
  enabled: boolean
  /** The canvas layer holding the frames' iframes. */
  container: HTMLElement | null
  page: string
  /** Every frame of the page where it draws, the hidden ones included. */
  frames: () => readonly FrameRecord[]
  toBoard: (point: ClientPoint) => BoardPoint
  /** Lands the dropped file, `placeFile` in the app. */
  place?: typeof placeFile
  /** Lands a file dropped on bare canvas in a frame of its own, `placeFileFrame` in the app. */
  placeFrame?: typeof placeFileFrame
  /** Reads a file's natural size for the ghost, from the server in the app. */
  measure?: typeof naturalSize
}

/**
 * Makes the hit layer a drop target for an Assets tile, a release over no frame
 * making a frame of its own. A system file is taken and dropped on nothing, so
 * it never opens in place of the board.
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
    placeFrame = placeFileFrame,
    measure = naturalSize,
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
    // Each file's size as its first drag over the canvas read it, null until it comes.
    const sizes = new Map<string, AssetSize | null>()
    const reading = new Set<string>()
    let over: { point: ClientPoint; file: PlaceableFile } | null = null
    /** The file's size, null when it has none of its own, undefined until it is read. */
    const sizeOf = (file: PlaceableFile): AssetSize | null | undefined => {
      const url = assetUrl(file.project, file.path)
      if (!sizes.has(url) && !reading.has(url)) {
        reading.add(url)
        void measure(url, file.kind).then((size) => {
          sizes.set(url, size)
          if (over) follow(over.point, over.file)
        })
      }
      return sizes.get(url)
    }
    const follow = (point: ClientPoint | null, file?: PlaceableFile | null) => {
      over = point && file ? { point, file } : null
      if (!point) {
        // The next drag reads each file again, since it may have been replaced.
        sizes.clear()
        reading.clear()
        tileDragStore.setState({ at: null, ghost: null })
        return
      }
      const at = toBoard(point)
      const all = frames()
      const size = file && !overFrame(all, at) ? sizeOf(file) : undefined
      tileDragStore.setState({
        at,
        ghost:
          file && size !== undefined
            ? {
                box: fileFrameBox(size, at),
                name: nextFreeName(
                  fileFrameName(file.path),
                  all.map((frame) => frame.name),
                ),
                hugging: file.kind === 'audio' ? 'height' : undefined,
              }
            : null,
      })
    }
    const stopTarget = dropTargetForElements({
      element,
      canDrop: ({ source }) =>
        liveStore.getState().canWrite && draggedFile(source.data) !== null,
      onDragEnter: ({ source, location }) =>
        follow(location.current.input, draggedFile(source.data)),
      onDrag: ({ source, location }) =>
        follow(location.current.input, draggedFile(source.data)),
      onDragLeave: () => follow(null),
      onDrop: ({ source, location }) => {
        follow(null)
        const file = draggedFile(source.data)
        if (!file) return
        const at = toBoard(location.current.input)
        const all = frames()
        void (overFrame(all, at)
          ? place(container, page, all, at, file)
          : placeFrame(page, all, at, file))
      },
    })
    return () => {
      stopTarget()
      element.removeEventListener('dragover', swallowFiles)
      element.removeEventListener('drop', swallowFiles)
      follow(null)
    }
  }, [
    target,
    enabled,
    container,
    page,
    frames,
    toBoard,
    place,
    placeFrame,
    measure,
  ])
}

/**
 * Whether a board point sits in any frame's box, a hidden, locked, or still
 * loading one included, since a drop there is over a frame and makes none.
 */
export function overFrame(
  frames: readonly FrameRecord[],
  at: BoardPoint,
): boolean {
  return frames.some(
    ({ box }) =>
      at.x >= box.x &&
      at.x < box.x + box.width &&
      at.y >= box.y &&
      at.y < box.y + box.height,
  )
}
