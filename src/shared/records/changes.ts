/** Who changed a frame, read off the live claim on it when the change landed. */
export interface ChangeAuthor {
  /** The session holding the claim. */
  session: string
  /** The agent's name, such as `claude`, which the toast names. */
  agent: string
  /** The listener's tag form, `<agent> · <project folder>`. */
  tag: string
}

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
}
