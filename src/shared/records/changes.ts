import { z } from 'zod'

/**
 * Who changed a frame, read off the live claim on it when the change landed,
 * or named by the agent that showed it.
 */
export interface ChangeAuthor {
  /** The session holding the claim. */
  session: string
  /** The agent's name, such as `claude`, which the toast names. */
  agent: string
  /** The listener's tag form, `<agent> · <project folder>`. */
  tag: string
}

export const changeAuthorSchema = z.object({
  session: z.string().min(1).max(256),
  agent: z.string().min(1).max(64),
  tag: z.string().min(1).max(256),
})

/**
 * One frame an agent wrote, as the server's change log holds it. Never a
 * write the board made, which the history tells the tracker of. A later
 * field goes in as optional.
 */
export interface FrameChange {
  /** Unique across the server's life, in the order the changes landed. */
  id: string
  /** The canonical frame ref, `<project>/<page>/<frame>`. */
  frame: string
  /** When the batch carrying it landed, as an ISO time. */
  at: string
  /** The frame file's content hash as the change left it. */
  hash: string
  /** The claim's holder when it landed, or null for an unclaimed frame. */
  author: ChangeAuthor | null
  /** The changed elements' indices in the new file, outermost only. */
  elements: number[]
  /** How many elements the change removed, which have nothing left to glow on. */
  removed: number
  /** The change is too wide to name by element, so the whole frame glows. */
  whole: boolean
  /** The file is new. */
  created: boolean
  /**
   * The content hash the frame held before this change, absent when
   * `created`. The frame route serves that source under `?at=<hash>` while
   * the server's log still names it.
   */
  before?: string
  /**
   * A mark an agent's show made, with no file change behind it. It names no
   * elements and no `before`, and stays unseen until the developer looks,
   * even on a hash this browser already saw.
   */
  shown?: boolean
}
