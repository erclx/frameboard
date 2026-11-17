import type { LiveStore } from '@/client/live/store'
import type { SelectionReport } from '@/shared/records/selection'

import type { SelectionState, SelectionStore } from '../selection'

/** Sends one report to the board's server, resolving once it answered. */
export type SendReport = (report: SelectionReport) => Promise<unknown>

/**
 * Reports each selection to the server for `frameboard selection`, one report
 * in flight and only the newest waiting, so an older one never lands last.
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
