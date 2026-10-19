import type { BoardTabs } from '../start'

export interface OpenBoardOptions {
  tabs: BoardTabs
  /** The address to open, called only once a tab is needed so each open mints its own ticket. */
  url: () => string
  /** Opens a browser tab, injected so a test never launches one. */
  open: (url: string) => void
  /** How long to wait for a writing tab from a previous server to reconnect before opening one. */
  graceMs: number
}

/**
 * Opens the board in a browser unless a writing board tab is connected or
 * connects within the grace, so a restarted server finds its old tab rather
 * than opening a second one. A tab that can only read does not count. Resolves whether it opened a tab.
 */
export async function openBoard({
  tabs,
  url,
  open,
  graceMs,
}: OpenBoardOptions): Promise<boolean> {
  if (await tabs.waitForWriter(graceMs)) return false
  open(url())
  return true
}
