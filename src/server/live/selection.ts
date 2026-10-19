import type { SelectionReport } from '@/shared/records/selection'

/** What a board tab reports it has selected, in refs and the element's address. */
export type ReportedSelection = Omit<SelectionReport, 'tab'>

export interface SelectionHolder {
  /** Keeps a writing tab's report, replacing whatever any tab reported before. */
  report: (tab: string, selection: ReportedSelection) => void
  /** Forgets the report when the tab that made it closes its socket. */
  closeTab: (tab: string) => void
  /** The last report still held, or null with none. */
  current: () => ReportedSelection | null
  /** How many writing board tabs are connected. */
  tabs: () => number
}

/**
 * The selection the open board shows, as the last writing tab to report it
 * left it. Selecting writes nothing to the board folder, so this lives in
 * the server's memory alone and a restart starts it empty.
 */
export function createSelectionHolder(tabs: () => number): SelectionHolder {
  let held: { tab: string; selection: ReportedSelection } | null = null
  return {
    report: (tab, selection) => {
      held = { tab, selection }
    },
    closeTab: (tab) => {
      if (held?.tab === tab) held = null
    },
    current: () => held?.selection ?? null,
    tabs,
  }
}
