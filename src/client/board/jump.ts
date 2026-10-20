import { navigate } from 'wouter/use-browser-location'

import { findAction } from '@/client/actions/registry'
import { canvasView } from '@/client/board/view'
import { boardUrl } from '@/shared/board-urls'

let stopWaiting: (() => void) | null = null

/**
 * Applies a selection on the page `<project>/<page>` and zooms to it. The
 * selection is applied before the route changes, since a canvas mounting for
 * another page clears one naming a different page, and the zoom waits for
 * the new page's canvas to attach, since there is nothing to zoom before. A
 * later jump drops the wait of an earlier one that never saw its canvas.
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
