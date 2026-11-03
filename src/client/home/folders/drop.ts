import {
  draggable,
  dropTargetForElements,
} from '@atlaskit/pragmatic-drag-and-drop/adapter/element-adapter'
import { combine } from '@atlaskit/pragmatic-drag-and-drop/combine'
import type { DragLocationHistory } from '@atlaskit/pragmatic-drag-and-drop/types'
import { type RefObject, useEffect, useRef, useState } from 'react'

import { folderKey } from './entries'

/** What a home card or row a project drops on files it with. */
export type DropTarget =
  | { kind: 'project'; name: string; group: string | null }
  | { kind: 'folder'; key: string; name: string }

/** The drag data a home project card carries, read back by every target. */
const SOURCE = 'frameboard-home-project'

interface DragSource {
  name: string
  group: string | null
}

function sourceOf(data: Record<string | symbol, unknown>): DragSource | null {
  if (data.type !== SOURCE || typeof data.name !== 'string') return null
  return {
    name: data.name,
    group: typeof data.group === 'string' ? data.group : null,
  }
}

/**
 * Whether a project dropped on `target` would file somewhere new: never on
 * itself, and never into the folder it already sits in.
 */
function files(source: DragSource, target: DropTarget): boolean {
  const into = target.kind === 'folder' ? target.key : target.group
  const from = source.group === null ? null : folderKey(source.group)
  if (target.kind === 'project' && target.name === source.name) return false
  return into === null || folderKey(into) !== from
}

interface HomeDragOptions {
  /** The project the element drags, absent for a folder, which never drags. */
  source?: DragSource
  target: DropTarget
  /** Off while the tab may not write or the name is being renamed. */
  enabled: boolean
  /** Files the dropped project by its name. */
  onDrop: (project: string) => void
}

/**
 * Makes a home card or row a drop target filing the project dropped on it,
 * and its link draggable when it is a project's, answering whether a project
 * that would file somewhere new is over it. The link drags rather than the
 * element, since a link drags natively and would start its own drag.
 */
export function useHomeDrag(
  element: RefObject<HTMLElement | null>,
  { source, target, enabled, onDrop }: HomeDragOptions,
): boolean {
  const [over, setOver] = useState(false)
  const dropped = useRef(onDrop)
  useEffect(() => {
    dropped.current = onDrop
  })
  const name = source?.name
  const group = source?.group ?? null
  const targetKind = target.kind
  const targetName = target.name
  const targetGroup = target.kind === 'folder' ? target.key : target.group

  useEffect(() => {
    const node = element.current
    if (!node || !enabled) return
    const self: DropTarget =
      targetKind === 'folder'
        ? { kind: 'folder', key: targetGroup ?? '', name: targetName }
        : { kind: 'project', name: targetName, group: targetGroup }
    const accepts = (data: Record<string | symbol, unknown>) => {
      const dragged = sourceOf(data)
      return dragged !== null && files(dragged, self)
    }
    // A member row sits inside its folder's row, and the library runs every
    // target under the pointer, so only the innermost one shows the hint and
    // files, which a drop on a member would otherwise do twice.
    const innermost = (location: DragLocationHistory) =>
      location.current.dropTargets[0]?.element === node
    const cleanups = [
      dropTargetForElements({
        element: node,
        canDrop: ({ source: drag }) => accepts(drag.data),
        onDragEnter: ({ location }) => setOver(innermost(location)),
        onDropTargetChange: ({ location }) => setOver(innermost(location)),
        onDragLeave: () => setOver(false),
        onDrop: ({ source: drag, location }) => {
          setOver(false)
          const dragged = sourceOf(drag.data)
          if (dragged && innermost(location)) dropped.current(dragged.name)
        },
      }),
    ]
    if (name !== undefined) {
      cleanups.push(
        draggable({
          element:
            node.querySelector<HTMLElement>('[data-project-link]') ?? node,
          getInitialData: () => ({ type: SOURCE, name, group }),
        }),
      )
    }
    return combine(...cleanups)
  }, [element, enabled, name, group, targetKind, targetName, targetGroup])

  return over
}
