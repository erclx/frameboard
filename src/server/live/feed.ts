import { isEqual, patchBetween } from '@/shared/board-sync/patch'
import { renameOnBoard, takesRename } from '@/shared/board-sync/rename'
import type { ListResult } from '@/shared/records/list'

import type { LiveHub } from './hub'

export interface BoardFeed {
  /** Sends every tab the board a scan found. */
  push: (board: ListResult) => void
  /** Tells every tab the board's own rename, ahead of the batch that carries it. */
  rename: (before: string, after: string) => void
  /**
   * Delivers the board its scan found to one tab, and to the tabs already
   * joined whatever that scan found ahead of its batch.
   */
  join: (board: ListResult, deliver: (board: ListResult) => void) => void
}

/**
 * Holds the board the tabs hold, which every patch starts from. Each verb
 * moves it and sends in one synchronous step, so no other crosses between.
 */
export function createBoardFeed(
  hub: Pick<LiveHub, 'broadcast' | 'broadcastBoard' | 'broadcastPatch'>,
): BoardFeed {
  let held: ListResult = { root: '', projects: [] }

  return {
    push: (board) => {
      hub.broadcastBoard(board, patchBetween(held, board))
      held = board
    },
    rename: (before, after) => {
      hub.broadcast({ type: 'renamed', before, after })
      if (takesRename(held, before, after)) {
        held = renameOnBoard(held, before, after)
      }
    },
    join: (board, deliver) => {
      if (!isEqual(held, board)) hub.broadcastPatch(patchBetween(held, board))
      held = board
      deliver(board)
    },
  }
}
