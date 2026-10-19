import { navigate } from 'wouter/use-browser-location'

import { findAction } from '@/client/actions/registry'
import { select, selectionStore } from '@/client/board/selection'
import { canvasView } from '@/client/board/view'
import { boardUrl } from '@/shared/board-urls'
import type { ListResult } from '@/shared/records/list'

/** One place the palette jumps to, by the ref the board names it with. */
export interface Target {
  ref: string
  label: string
  /** What the row shows on its right, such as the page a frame sits on. */
  hint?: string
}

export interface Targets {
  frames: Target[]
  pages: Target[]
  projects: Target[]
}

/**
 * Every project, and the pages and shown frames of `project`, the one the
 * route names. A hidden frame is left out, since `pruneSelection` would drop
 * it from the selection the jump sets and there would be nothing to zoom to.
 */
export function boardTargets(
  board: ListResult,
  project: string | null,
): Targets {
  const open = board.projects.find((candidate) => candidate.name === project)
  return {
    projects: board.projects.map(({ name }) => ({ ref: name, label: name })),
    pages: (open?.pages ?? []).map((page) => ({
      ref: page.ref,
      label: page.name,
    })),
    frames: (open?.pages ?? []).flatMap((page) =>
      page.frames
        .filter((frame) => !frame.hidden)
        .map((frame) => ({
          ref: frame.ref,
          label: frame.name,
          hint: page.name,
        })),
    ),
  }
}

/** A project opens on its first page, which the board route redirects to. */
export function jumpToProject(name: string): void {
  navigate(`/p/${encodeURIComponent(name)}`)
}

export function jumpToPage(ref: string): void {
  const [project = '', page = ''] = ref.split('/')
  navigate(boardUrl(project, page))
}

let stopWaiting: (() => void) | null = null

/**
 * Selects the frame on its page and zooms to it. The selection is set before
 * the route changes, since a canvas mounting for another page clears one
 * naming a different page, and the zoom waits for the new page's canvas to
 * attach, since there is nothing to zoom before.
 */
export function jumpToFrame(ref: string): void {
  const [project = '', page = ''] = ref.split('/')
  const url = boardUrl(project, page)
  stopWaiting?.()
  stopWaiting = null
  select(selectionStore, `${project}/${page}`, [ref])
  if (onRoute(url) && canvasView.attached()) {
    zoomToSelection()
    return
  }
  const stop = canvasView.onAttach(() => {
    if (!canvasView.attached()) return
    stop()
    stopWaiting = null
    zoomToSelection()
  })
  stopWaiting = stop
  navigate(url)
}

function onRoute(url: string): boolean {
  return decodeURIComponent(location.pathname) === decodeURIComponent(url)
}

function zoomToSelection(): void {
  findAction('view.zoomToSelection')?.run()
}
