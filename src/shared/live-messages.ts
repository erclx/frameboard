import type { Finding } from './records/check'
import type { ListResult } from './records/list'
import type { BoardNote, Listener, Note } from './records/notes'

/** The socket path on the board's server. */
export const LIVE_PATH = '/api/live'

/**
 * What a client sends first on every open. Only `board` clients count as
 * open board tabs. An `inbox` client is a session's follower, taken only on
 * an upgrade carrying the address token as a bearer, never in the body.
 */
export type HelloMessage =
  | { type: 'hello'; role: 'board' }
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
  /** Whether this tab may write, sent after each hello's board. */
  | { type: 'access'; write: boolean }
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
