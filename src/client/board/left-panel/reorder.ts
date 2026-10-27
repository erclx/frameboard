import {
  draggable,
  dropTargetForElements,
  monitorForElements,
} from '@atlaskit/pragmatic-drag-and-drop/adapter/element-adapter'
import { combine } from '@atlaskit/pragmatic-drag-and-drop/combine'
import { attachClosestEdge } from '@atlaskit/pragmatic-drag-and-drop-hitbox/closest-edge/attach-closest-edge'
import { extractClosestEdge } from '@atlaskit/pragmatic-drag-and-drop-hitbox/closest-edge/extract-closest-edge'
import type { Edge } from '@atlaskit/pragmatic-drag-and-drop-hitbox/types'
import { getReorderDestinationIndex } from '@atlaskit/pragmatic-drag-and-drop-hitbox/util/get-reorder-destination-index'
import { type RefObject, useEffect, useState } from 'react'

function isRow(data: Record<string | symbol, unknown>, list: string): boolean {
  return data.list === list && typeof data.index === 'number'
}

/**
 * Makes one row of a list draggable and a drop target, answering the edge a
 * drag over it would land on, top or bottom, or null when none is over it.
 * Rows of different lists never drop on each other.
 */
export function useReorderRow(
  element: RefObject<HTMLElement | null>,
  { list, index, enabled }: { list: string; index: number; enabled: boolean },
): Edge | null {
  const [edge, setEdge] = useState<Edge | null>(null)

  useEffect(() => {
    const row = element.current
    if (!row || !enabled) return
    const data: Record<string | symbol, unknown> = { list, index }
    return combine(
      draggable({ element: row, getInitialData: () => data }),
      dropTargetForElements({
        element: row,
        canDrop: ({ source }) => isRow(source.data, list),
        getData: ({ input }) =>
          attachClosestEdge(data, {
            element: row,
            input,
            allowedEdges: ['top', 'bottom'],
          }),
        onDrag: ({ self, source }) => {
          // A row over itself, or over the edge that leaves it where it is, shows no line.
          const next = extractClosestEdge(self.data)
          const from = source.data.index as number
          const stays =
            from === index ||
            (next === 'top' && from === index - 1) ||
            (next === 'bottom' && from === index + 1)
          setEdge(stays ? null : next)
        },
        onDragLeave: () => setEdge(null),
        onDrop: () => setEdge(null),
      }),
    )
  }, [element, list, index, enabled])

  return edge
}

/**
 * Calls `onMove` with a row's index, where it lands, and its list when one
 * of the list's rows drops on another, never for a drop that leaves it in
 * place. A test in place of a list watches every list it passes, as one per
 * parent of a frame's element rows, and a row still drops only within its own.
 */
export function useReorderMonitor(
  list: string | ((list: string) => boolean),
  onMove: (from: number, to: number, list: string) => void,
): void {
  useEffect(
    () =>
      monitorForElements({
        canMonitor: ({ source }) =>
          typeof list === 'string'
            ? isRow(source.data, list)
            : typeof source.data.list === 'string' &&
              list(source.data.list) &&
              isRow(source.data, source.data.list),
        onDrop: ({ source, location }) => {
          const target = location.current.dropTargets[0]
          const of = source.data.list as string
          if (!target || !isRow(target.data, of)) return
          const from = source.data.index as number
          const to = getReorderDestinationIndex({
            startIndex: from,
            indexOfTarget: target.data.index as number,
            closestEdgeOfTarget: extractClosestEdge(target.data),
            axis: 'vertical',
          })
          if (to !== from) onMove(from, to, of)
        },
      }),
    [list, onMove],
  )
}
