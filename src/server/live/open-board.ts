import type { BoardTabs } from '../start'

export interface OpenBoardOptions {
  tabs: BoardTabs
  url: string
  /** Opens a browser tab, injected so a test never launches one. */
  open: (url: string) => void
  /** How long to wait for a tab from a previous server to reconnect before opening one. */
  graceMs: number
}

/**
 * Opens the board in a browser unless a board tab is connected or connects
 * within the grace, so a restarted server finds its old tab rather than
 * opening a second one. Resolves whether it opened a tab.
 */
export async function openBoard({
  tabs,
  url,
  open,
  graceMs,
}: OpenBoardOptions): Promise<boolean> {
  if (await tabs.waitForOne(graceMs)) return false
  open(url)
  return true
}
