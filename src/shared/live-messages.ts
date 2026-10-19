import type { Finding } from './records/check'
import type { ListResult } from './records/list'

/** The socket path on the board's server. */
export const LIVE_PATH = '/api/live'

/**
 * What a client sends first on every open. Only `board` clients count as
 * open board tabs, so another kind of listener can share the socket later.
 */
export interface HelloMessage {
  type: 'hello'
  role: 'board'
}

export type ClientMessage = HelloMessage

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
