import { isEqual, patchBetween } from '@/shared/board-sync/patch'
import { renameOnBoard, takesRename } from '@/shared/board-sync/rename'
import type { ListResult } from '@/shared/records/list'

import type { LiveHub } from './hub'
import {
  folderRenames,
  type Folders,
  keepFolders,
  renameFolder,
} from './project-folders'

/** A board on disk, and its project folders read after it. */
export interface Look {
  board: ListResult
  folders: Folders
}

export interface FoundBoard extends Look {
  /** How many renames the feed had heard of as the scan began. */
  renames: number
}

export interface BoardFeed {
  scan: () => Promise<FoundBoard>
  /** Sends every tab the board a scan found, and answers the board it sent. */
  push: (found: FoundBoard) => Promise<ListResult>
  /** Tells every tab the board's own rename, ahead of the batch that carries it. */
  rename: (before: string, after: string) => void
  /**
   * Delivers the board its scan found to one tab, and to the tabs already
   * joined whatever that scan found ahead of its batch.
   */
  join: (
    found: FoundBoard,
    deliver: (board: ListResult) => void,
  ) => Promise<void>
}

/**
 * Holds the board the tabs hold, which each verb moves and sends in one
 * synchronous step. A scan a rename overtook is taken again, since the old
 * name in it would read as the rename undone.
 */
export function createBoardFeed(
  hub: Pick<LiveHub, 'broadcast' | 'broadcastBoard' | 'broadcastPatch'>,
  {
    look,
    onFound,
  }: {
    look: () => Promise<Look>
    /** Told each project rename made on disk, ahead of the tabs. */
    onFound: (before: string, after: string) => void
  },
): BoardFeed {
  let held: ListResult = { root: '', projects: [] }
  let folders: Folders = new Map()
  let renames = 0

  const scan = async (): Promise<FoundBoard> => {
    const begun = renames
    return { ...(await look()), renames: begun }
  }

  const rename = (before: string, after: string) => {
    renames += 1
    // A push that scanned the new name first has announced it already.
    if (!takesRename(held, before, after)) return
    hub.broadcast({ type: 'renamed', before, after })
    held = renameOnBoard(held, before, after)
    folders = renameFolder(folders, before, after)
  }

  const announce = (found: Folders) => {
    for (const { before, after } of folderRenames(folders, found)) {
      onFound(before, after)
      rename(before, after)
    }
    folders = keepFolders(folders, found)
  }

  return {
    scan,
    push: async (found) => {
      let latest = found
      while (latest.renames !== renames) latest = await scan()
      announce(latest.folders)
      hub.broadcastBoard(latest.board, patchBetween(held, latest.board))
      held = latest.board
      return latest.board
    },
    rename,
    join: async (found, deliver) => {
      let latest = found
      while (latest.renames !== renames) latest = await scan()
      announce(latest.folders)
      if (!isEqual(held, latest.board)) {
        hub.broadcastPatch(patchBetween(held, latest.board))
      }
      held = latest.board
      deliver(latest.board)
    },
  }
}
