import type { BoardPatch } from './board-sync/patch'
import type { FrameChange } from './records/changes'
import type { Finding } from './records/check'
import type { Claim } from './records/claims'
import type { ListResult } from './records/list'
import type { BoardNote, Listener, Note } from './records/notes'
import type { Theme } from './theme'

/** The socket path on the board's server. */
export const LIVE_PATH = '/api/live'

/**
 * What a client sends first on every open. Only `board` clients count as
 * open board tabs. An `inbox` client is a session's follower, taken only on
 * an upgrade carrying the address token as a bearer, never in the body.
 */
export type HelloMessage =
  | {
      type: 'hello'
      role: 'board'
      /** The tab's own id, which its selection report carries, so the socket closing forgets it. */
      tab?: string
      /**
       * Whether the tab takes a `patch` in place of every board after its
       * first, absent from one loaded before patches, which takes whole boards.
       */
      patches?: boolean
    }
  | {
      type: 'hello'
      role: 'inbox'
      /** The session the follower prints notes for. */
      session: string
      /** What the board shows for it. */
      tag: string
    }

/** A follower printed the note with this id. */
export interface AckMessage {
  type: 'ack'
  id: string
}

/** A patch named a record this tab does not hold, so it takes the whole board again. */
export interface ResyncMessage {
  type: 'resync'
}

export type ClientMessage = HelloMessage | AckMessage | ResyncMessage

/** Messages the server sends, as types alone so the client bundle takes no schema library. */
export type ServerMessage =
  /**
   * The port frames load from, first on each board hello, since a frame on
   * the board's own port could write as the board.
   */
  | { type: 'frames'; port: number }
  /**
   * The whole board, on hello and on a `resync`, and after every watch batch
   * to a tab that asked for no patches.
   */
  | { type: 'board'; data: ListResult }
  /**
   * The board against the one this tab holds, after every watch batch, one
   * that changed no record included.
   */
  | { type: 'patch'; data: BoardPatch }
  /**
   * Frames to reload, `hashes` set only when the file was the sole cause, so a
   * tab already showing those bytes may skip the reload.
   */
  | { type: 'reload'; refs: string[]; hashes?: Record<string, string> }
  /** Point the open board at one frame. */
  | { type: 'show'; ref: string }
  /**
   * Check findings by frame ref: every frame after hello, and after each
   * batch's board or patch the frames it rechecked, where an empty list clears one.
   */
  | { type: 'findings'; findings: Record<string, Finding[]> }
  /**
   * Whether this tab may write, and whether a note it sends can start a
   * session, sent after each hello's board. `editButton` comes only to a tab
   * that reads, on a server started with the button.
   */
  | { type: 'access'; write: boolean; dispatch: boolean; editButton?: boolean }
  /**
   * One page's notes by its `<project>/<page>` ref: every page holding notes
   * after hello, and after each batch the pages it touched.
   */
  | { type: 'notes'; page: string; notes: BoardNote[] }
  /** The sessions following their inbox, on hello and on every change. */
  | { type: 'listeners'; listeners: Listener[] }
  /** A queued note, to its session's follower alone, with the line it prints. */
  | { type: 'note'; note: Note; ref: string; line: string }
  /** How many steps the board can undo and redo, after each hello's access and every change. */
  | { type: 'history'; undo: number; redo: number }
  /**
   * A project, page, or frame the board's own write, undo, or redo renamed,
   * as a project name, page ref, or frame ref on each side, sent ahead of the
   * batch's board or patch so a tab keeps the frames it shows and their state.
   */
  | { type: 'renamed'; before: string; after: string }
  /** The live claims, after each hello's history, on every change, and as one expires. */
  | { type: 'claims'; claims: Claim[] }
  /**
   * Frames an agent changed: the server's recent log after each hello's
   * claims, and each batch's changes once the grace for the board's own
   * writes has passed.
   */
  | { type: 'changes'; changes: FrameChange[] }
  /**
   * Thumbnail stamps in one theme by frame ref: a stamp as each render lands,
   * and `null` for every frame a batch reloads, marking it stale.
   */
  | {
      type: 'thumbnails'
      theme: Theme
      stamps: Record<string, string | null>
    }
