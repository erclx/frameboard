import { z } from 'zod'

/** Where a note on one element points, in the edit address's terms. */
export const noteAnchorSchema = z.looseObject({
  /** The element's `querySelectorAll('*')` index, skipping injected elements. */
  index: z.int().min(0),
  /** The frame file's `contentHash` when the note was pinned. */
  hash: z.string(),
})

export type NoteAnchor = z.infer<typeof noteAnchorSchema>

export const NOTE_STATES = ['open', 'queued', 'delivered', 'done'] as const

export type NoteState = (typeof NOTE_STATES)[number]

export const noteSchema = z.looseObject({
  /** `n_` and 8 hex characters, unique across the board. */
  id: z.string(),
  /** The page's ordinal on a root note, never reused. A reply carries null. */
  number: z.int().min(1).nullable(),
  /** The frame's name in this page. */
  frame: z.string(),
  /** Null for a note on the whole frame. */
  anchor: noteAnchorSchema.nullable(),
  text: z.string(),
  from: z.enum(['developer', 'agent']),
  /** Who signed it, as git names them, stamped by the server. */
  author: z.string().nullable(),
  /** The agent's session id on an agent reply. */
  session: z.string().nullable(),
  /** The session a root note is sent to. */
  to: z.string().nullable(),
  /** A root note's delivery state. A reply carries `open`. */
  state: z.enum(NOTE_STATES),
  /** The root note's id on a reply, else null. */
  thread: z.string().nullable(),
  createdAt: z.string(),
  updatedAt: z.string(),
})

export type Note = z.infer<typeof noteSchema>

/** `<project>/<page>/notes.json`. */
export const notesFileSchema = z.looseObject({
  version: z.literal(1),
  notes: z.array(noteSchema),
})

export type NotesFile = z.infer<typeof notesFileSchema>

/** A session following its inbox on the live socket. */
export const listenerSchema = z.object({
  session: z.string(),
  /** What the board shows for it, never used to address it. */
  tag: z.string(),
  since: z.string(),
})

export type Listener = z.infer<typeof listenerSchema>
