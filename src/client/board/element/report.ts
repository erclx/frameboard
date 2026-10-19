import type { LiveStore } from '@/client/live/store'
import type { SelectionReport } from '@/shared/records/selection'

import type { SelectionState, SelectionStore } from '../selection'

/** Sends one report to the board's server, resolving once it answered. */
export type SendReport = (report: SelectionReport) => Promise<unknown>

/**
 * Tells the server each selection this tab makes while it may write, so
 * `frameboard selection` reads what the developer has selected. One report
 * is in flight at a time and only the newest waiting one follows it, so an
 * older report never lands after a newer one, and a tab that regains write
 * access, as after a server restart, reports again. Returns the function
 * that stops reporting.
 */
export function followReports(
  selection: SelectionStore,
  live: LiveStore,
  tab: string,
  send: SendReport,
): () => void {
  let sequence = 0
  let sent = 0
  let flying = false
  const flush = () => {
    if (flying || sent === sequence || !live.getState().canWrite) return
    flying = true
    sent = sequence
    void send({ tab, ...reportOf(selection.getState()) })
      .catch(() => {})
      .finally(() => {
        flying = false
        flush()
      })
  }
  const changed = () => {
    sequence += 1
    flush()
  }
  changed()
  const unsubscribeSelection = selection.subscribe(changed)
  const unsubscribeLive = live.subscribe((state, previous) => {
    if (state.canWrite && !previous.canWrite) changed()
  })
  return () => {
    unsubscribeLive()
    unsubscribeSelection()
  }
}

function reportOf({
  page,
  frames,
  element,
}: SelectionState): Omit<SelectionReport, 'tab'> {
  return {
    page,
    frames: [...frames],
    element: element
      ? { ref: element.frame, index: element.index, hash: element.hash }
      : null,
  }
}
