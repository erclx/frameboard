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

export type ClientMessage = HelloMessage | AckMessage

/** Messages the server sends, as types alone so the client bundle takes no schema library. */
export type ServerMessage =
  /** The whole board, on hello and after every watch batch. */
  | { type: 'board'; data: ListResult }
  /** Frames whose rendered inputs changed on disk, each to reload alone. */
  | { type: 'reload'; refs: string[] }
  /** Point the open board at one frame. */
  | { type: 'show'; ref: string }
  /**
   * Check findings by frame ref: every frame after hello, and after each
   * batch's `board` the frames it rechecked, where an empty list clears one.
   */
  | { type: 'findings'; findings: Record<string, Finding[]> }
  /**
   * Whether this tab may write, and whether a note it sends can start a
   * session, sent after each hello's board.
   */
  | { type: 'access'; write: boolean; dispatch: boolean }
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
