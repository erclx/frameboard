import { join } from 'node:path'

import type { Command } from 'commander'

import {
  type ResolvedRef,
  resolveFrameRef,
  resolvePageRef,
  resolveProject,
} from '@/server/board/refs'
import { resolveAnchors } from '@/server/notes/anchor'
import {
  addReply,
  findNote,
  listPageNotes,
  newNoteId,
  notesPath,
  type PageNotes,
  readNotes,
  setState,
  updateNotes,
} from '@/server/notes/store'
import { FrameboardError } from '@/shared/errors'
import type { Note } from '@/shared/records/notes'

import {
  act,
  addVerb,
  boardOf,
  type CommonOptions,
  type ProgramContext,
} from '../program'
import { SESSION_ENV } from '../session'

/** A note as `notes` lists it, with where it sits and the element it still points at. */
export interface ListedNote extends Note {
  /** The frame ref, `<project>/<page>/<frame>`. */
  ref: string
  /** The element index while the anchor holds, else null for the frame. */
  element: number | null
  /** Each of `images` by absolute path, so a caller anywhere opens it. Absent with no images. */
  imagePaths?: string[]
}

interface ListOptions extends CommonOptions {
  page?: string
  frame?: string
  all?: boolean
}

export function registerNotes(program: Command, context: ProgramContext): void {
  const { io } = context
  const notes = addVerb(
    program,
    'notes',
    "List the open notes and their threads, the developer's requests from the board",
    { project: true },
  )
    .option('--page <page-ref>', 'only the notes on this page')
    .option('--frame <frame-ref>', 'only the notes on this frame')
    .option('--all', 'include the threads marked done')
    // notes lists with flags of its own, so reply and done would otherwise
    // lose --json and --root to it.
    .enablePositionalOptions()

  act<ListOptions>(notes, context, async (_args, options) => {
    const root = await boardOf(options, io)
    const frame = options.frame
      ? await resolveFrameRef(root, options.frame, {
          project: options.project,
          cwd: io.cwd,
        })
      : undefined
    const pages = await pagesIn(root, options, frame, io.cwd)
    const listed: ListedNote[] = []
    for (const place of pages) {
      const file = await readNotes(place.path)
      const done = new Set(
        file.notes.filter((n) => n.state === 'done').map((n) => n.id),
      )
      const kept = byThread(file.notes).filter(
        (note) =>
          (options.all || !done.has(note.thread ?? note.id)) &&
          (!frame || note.frame === frame.name),
      )
      const pageDir = join(root, place.project, place.page)
      const elements = await resolveAnchors(pageDir, kept)
      listed.push(
        ...kept.map((note) => ({
          ...note,
          ref: `${place.project}/${place.page}/${note.frame}`,
          element: elements[note.id] ?? null,
          ...(note.images?.length
            ? { imagePaths: note.images.map((image) => join(pageDir, image)) }
            : {}),
        })),
      )
    }
    return { data: { notes: listed }, human: describe(listed) }
  })

  act<CommonOptions>(
    addVerb(notes, 'reply', 'Answer a note in its thread on the board', {
      project: true,
    })
      .argument('<id>', 'the note id, n_ and 8 hex characters')
      .argument('<text>', 'the reply'),
    context,
    async ([id = '', text = ''], options) => {
      const root = await boardOf(options, io)
      const found = await noteIn(root, id, options.project)
      const replyId = newNoteId()
      const file = await updateNotes(found.path, (current) =>
        addReply(
          current,
          id,
          {
            text,
            from: 'agent',
            author: null,
            session: process.env[SESSION_ENV] || null,
          },
          { now: new Date(), id: replyId },
        ),
      )
      const reply = file.notes.find((note) => note.id === replyId)
      return {
        data: { note: reply },
        human: `Replied to ${reply?.thread ?? id} on ${found.project}/${found.page}/${found.note.frame}`,
      }
    },
  )

  act<CommonOptions>(
    addVerb(notes, 'done', 'Close a note, hiding its marker on the board', {
      project: true,
    }).argument('<id>', 'the note id, n_ and 8 hex characters'),
    context,
    async ([id = ''], options) => {
      const root = await boardOf(options, io)
      const found = await noteIn(root, id, options.project)
      const file = await updateNotes(found.path, (current) =>
        setState(current, id, 'done', new Date()),
      )
      const rootId = found.note.thread ?? found.note.id
      const closed = file.notes.find((note) => note.id === rootId)
      return { data: { note: closed }, human: `Closed ${rootId}` }
    },
  )
}

/** The note an id names, refused as missing when `--project` names another project than the one holding it. */
async function noteIn(root: string, id: string, project: string | undefined) {
  const scope =
    project === undefined ? undefined : await resolveProject(root, project)
  const found = await findNote(root, id)
  if (scope && found.project !== scope.name) {
    throw new FrameboardError(
      'note-not-found',
      `No note ${id} in project ${scope.name}. It sits in ${found.project}.`,
      { id, project: scope.name },
    )
  }
  return found
}

/** The pages a listing reads: the one `--page` or `--frame` names, else every page in scope. */
async function pagesIn(
  root: string,
  options: ListOptions,
  frame: ResolvedRef | undefined,
  cwd: string,
): Promise<PageNotes[]> {
  const page =
    frame ??
    (options.page
      ? await resolvePageRef(root, options.page, {
          project: options.project,
          cwd,
        })
      : undefined)
  if (page) {
    return [
      {
        project: page.project,
        page: page.page,
        path: notesPath(root, page.project, page.page),
      },
    ]
  }
  const all = await listPageNotes(root)
  if (options.project === undefined) return all
  const { name } = await resolveProject(root, options.project)
  return all.filter((place) => place.project === name)
}

/** Each root followed by its replies, in the order the roots were pinned. */
function byThread(notes: Note[]): Note[] {
  return notes
    .filter((note) => note.thread === null)
    .flatMap((root) => [
      root,
      ...notes.filter((note) => note.thread === root.id),
    ])
}

function describe(notes: ListedNote[]): string {
  if (notes.length === 0) return 'No open notes'
  return notes
    .map((note) => {
      const text = `${note.text.replace(/\s+/g, ' ').trim()}${(
        note.imagePaths ?? []
      )
        .map((path) => `\n      image: ${path}`)
        .join('')}`
      if (note.thread) {
        return `    ${note.from === 'agent' ? 'agent' : (note.author ?? 'developer')}: ${text}`
      }
      const where =
        note.element === null ? note.ref : `${note.ref} element ${note.element}`
      return `${note.id}  Note ${note.number} on ${where}  ${note.state}${note.to ? ` to ${note.to}` : ''}\n    ${note.author ?? 'developer'}: ${text}`
    })
    .join('\n')
}
