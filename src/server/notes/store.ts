import { randomBytes } from 'node:crypto'
import { join } from 'node:path'

import { FrameboardError } from '@/shared/errors'
import {
  type BoardNote,
  type Note,
  type NoteAnchor,
  type NotesFile,
  notesFileSchema,
} from '@/shared/records/notes'

import { readRecord, type RecordSpec, updateRecord } from '../board/json-record'
import { listPageFolders, listProjects } from '../board/scan'
import { resolveAnchors } from './anchor'
import type { NoteDelivery } from './delivery'
import { noteLine } from './line'

export const NOTES_FILE = 'notes.json'

export const notesSpec: RecordSpec<NotesFile> = {
  schema: notesFileSchema,
  invalidCode: 'notes-invalid',
  empty: () => ({ version: 1, notes: [] }),
}

/** One page's notes file, located in the board. */
export interface PageNotes {
  project: string
  page: string
  /** The `notes.json` path, which may not exist yet. */
  path: string
}

/** What a write stamps on a note, passed in so a test fixes the time and the id. */
export interface Stamp {
  now: Date
  id: string
}

/** `n_` and 8 random hex characters. */
export function newNoteId(): string {
  return `n_${randomBytes(4).toString('hex')}`
}

export function notesPath(root: string, project: string, page: string): string {
  return join(root, project, page, NOTES_FILE)
}

export function readNotes(path: string): Promise<NotesFile> {
  return readRecord(path, notesSpec)
}

/** Reads, changes, and writes a page's notes under its lock, refusing a file that does not parse. */
export function updateNotes(
  path: string,
  change: (file: NotesFile) => NotesFile,
): Promise<NotesFile> {
  return updateRecord(path, notesSpec, change)
}

/** Every page in the board, as the place its notes file sits. */
export async function listPageNotes(root: string): Promise<PageNotes[]> {
  const projects = await listProjects(root)
  const pages = await Promise.all(
    projects.map(async (project) =>
      (await listPageFolders(join(root, project))).map((page) => ({
        project,
        page,
        path: notesPath(root, project, page),
      })),
    ),
  )
  return pages.flat()
}

/**
 * The page holding a note id, scanning every page of the board. A page whose
 * file does not parse cannot be read for the id, so when no other page holds
 * it the first such page's `notes-invalid` is thrown rather than a missing note.
 */
export async function findNote(
  root: string,
  id: string,
): Promise<PageNotes & { file: NotesFile; note: Note }> {
  let unreadable: FrameboardError | undefined
  for (const place of await listPageNotes(root)) {
    let file: NotesFile
    try {
      file = await readNotes(place.path)
    } catch (error) {
      if (!(error instanceof FrameboardError)) throw error
      unreadable ??= error
      continue
    }
    const note = file.notes.find((candidate) => candidate.id === id)
    if (note) return { ...place, file, note }
  }
  if (unreadable) throw unreadable
  throw new FrameboardError('note-not-found', `No note ${id} in this board.`, {
    id,
  })
}

/** The root of the thread a note belongs to, being the note itself when it is one. */
export function rootOf(file: NotesFile, id: string): Note {
  const note = file.notes.find((candidate) => candidate.id === id)
  const root = note?.thread
    ? file.notes.find((candidate) => candidate.id === note.thread)
    : note
  if (!root) {
    throw new FrameboardError('note-not-found', `No note ${id} in this page.`, {
      id,
    })
  }
  return root
}

export interface PinFields {
  frame: string
  anchor: NoteAnchor | null
  text: string
  author: string | null
  /** The session to send it to, or null to save it without sending. */
  to: string | null
}

/** Adds a root note numbered one past the page's highest, so a number is never reused. */
export function addRoot(
  file: NotesFile,
  fields: PinFields,
  { now, id }: Stamp,
): NotesFile {
  const number = Math.max(0, ...file.notes.map((note) => note.number ?? 0)) + 1
  const at = now.toISOString()
  const note: Note = {
    id,
    number,
    frame: fields.frame,
    anchor: fields.anchor,
    text: fields.text,
    from: 'developer',
    author: fields.author,
    session: null,
    to: fields.to,
    state: fields.to === null ? 'open' : 'queued',
    thread: null,
    createdAt: at,
    updatedAt: at,
  }
  return { ...file, notes: [...file.notes, note] }
}

export interface ReplyFields {
  text: string
  from: Note['from']
  author: string | null
  session: string | null
  /** A developer reply handing the thread to a session re-queues the root to it. */
  to?: string
}

/** Appends a reply to the thread `to` belongs to, reopening nothing a reply does not name. */
export function addReply(
  file: NotesFile,
  replyTo: string,
  fields: ReplyFields,
  { now, id }: Stamp,
): NotesFile {
  const root = rootOf(file, replyTo)
  const at = now.toISOString()
  const reply: Note = {
    id,
    number: null,
    frame: root.frame,
    anchor: root.anchor,
    text: fields.text,
    from: fields.from,
    author: fields.author,
    session: fields.session,
    to: null,
    state: 'open',
    thread: root.id,
    createdAt: at,
    updatedAt: at,
  }
  const notes = file.notes.map((note) =>
    note.id === root.id && fields.to !== undefined
      ? { ...note, to: fields.to, state: 'queued' as const, updatedAt: at }
      : note,
  )
  return { ...file, notes: [...notes, reply] }
}

/** Sets the state of the thread `id` belongs to, and its addressee when one is given. */
export function setState(
  file: NotesFile,
  id: string,
  state: Note['state'],
  now: Date,
  to?: string,
): NotesFile {
  const root = rootOf(file, id)
  return {
    ...file,
    notes: file.notes.map((note) =>
      note.id === root.id
        ? {
            ...note,
            state,
            ...(to === undefined ? {} : { to }),
            updatedAt: now.toISOString(),
          }
        : note,
    ),
  }
}

/** A thread's messages in the order they were written, root first. */
export function threadOf(file: NotesFile, rootId: string): Note[] {
  return file.notes.filter(
    (note) => note.id === rootId || note.thread === rootId,
  )
}

/** A page's notes as the board draws them, an unreadable file reading as none. */
export async function pageView(
  root: string,
  place: PageNotes,
): Promise<BoardNote[]> {
  let file: NotesFile
  try {
    file = await readNotes(place.path)
  } catch (error) {
    // The board still renders the page's frames, and `notes` reports the file.
    if (error instanceof FrameboardError) return []
    throw error
  }
  const elements = await resolveAnchors(
    join(root, place.project, place.page),
    file.notes,
  )
  return file.notes.map((note) => ({
    ...note,
    element: elements[note.id] ?? null,
  }))
}

/** Every page holding notes, by `<project>/<page>` ref, as the board draws them. */
export async function boardView(
  root: string,
): Promise<Record<string, BoardNote[]>> {
  const pages = await Promise.all(
    (await listPageNotes(root)).map(
      async (place) =>
        [
          `${place.project}/${place.page}`,
          await pageView(root, place),
        ] as const,
    ),
  )
  return Object.fromEntries(pages.filter(([, notes]) => notes.length > 0))
}

/**
 * The root notes queued to a session, read from disk, each with the line its
 * follower prints, carrying the thread's newest developer message.
 */
export async function queuedFor(
  root: string,
  session: string,
): Promise<NoteDelivery[]> {
  const deliveries: NoteDelivery[] = []
  for (const place of await listPageNotes(root)) {
    const notes = await pageView(root, place)
    for (const note of notes) {
      if (note.thread !== null || note.state !== 'queued') continue
      if (note.to !== session) continue
      const ref = `${place.project}/${place.page}/${note.frame}`
      const newest = notes
        .filter(
          (each) =>
            (each.id === note.id || each.thread === note.id) &&
            each.from === 'developer',
        )
        .at(-1)
      const { element, ...stored } = note
      deliveries.push({
        note: stored,
        ref,
        line: noteLine({
          id: note.id,
          ref,
          element,
          text: (newest ?? note).text,
        }),
      })
    }
  }
  return deliveries
}

/** Marks a root note delivered, while it is still queued to that session. */
export async function markDelivered(
  root: string,
  id: string,
  session: string,
  now: Date,
): Promise<void> {
  const found = await findNote(root, id)
  await updateNotes(found.path, (file) => {
    const note = file.notes.find((each) => each.id === id)
    return note?.state === 'queued' && note.to === session
      ? setState(file, id, 'delivered', now)
      : file
  })
}
