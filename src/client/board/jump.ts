import { navigate } from 'wouter/use-browser-location'

import { findAction } from '@/client/actions/registry'
import { canvasView } from '@/client/board/view'
import { boardUrl } from '@/shared/board-urls'

let stopWaiting: (() => void) | null = null

/**
 * Selects on a page and zooms to it, selecting before the route changes, since
 * a mounting canvas clears another page's selection, and zooming once it attaches.
 */
export function jumpTo(pageRef: string, applySelection: () => void): void {
  const [project = '', page = ''] = pageRef.split('/')
  const url = boardUrl(project, page)
  stopWaiting?.()
  stopWaiting = null
  applySelection()
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
