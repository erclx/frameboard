import { readFile, stat } from 'node:fs/promises'
import { join } from 'node:path'

import { FrameboardError } from '@/shared/errors'
import type { Note, NoteAnchor } from '@/shared/records/notes'

import { isCode } from '../board/json-record'
import { FRAME_EXTENSION } from '../board/scan'
import { contentHash, parseFrame } from '../edit/address'

/**
 * The anchor for element `index` of a frame, refusing `stale-address` when
 * the file changed since the board rendered it at `renderedAt`, since the
 * index the board counted belongs to the file it showed.
 */
export async function anchorFor(
  framePath: string,
  index: number,
  renderedAt: string,
): Promise<NoteAnchor> {
  const [bytes, { mtimeMs }] = await Promise.all([
    readFile(framePath),
    stat(framePath),
  ])
  const stale = new Date(mtimeMs).toISOString() !== renderedAt
  if (stale || index >= parseFrame(bytes.toString('utf8')).elements.length) {
    throw new FrameboardError(
      'stale-address',
      `The frame changed since the board showed it, so element ${index} may be another one. Pick it again.`,
      { path: framePath, index },
    )
  }
  return { index, hash: contentHash(bytes) }
}

/**
 * The element an anchor points at while the frame file hashes as `hash`: its
 * pinned index under the pinned hash, the index a board write carried it to
 * under a hash it has followed, else null, being the frame itself.
 */
export function indexAt(
  anchor: NoteAnchor,
  hash: string | null,
): number | null {
  if (hash === null) return null
  if (hash === anchor.hash) return anchor.index
  return anchor.known?.[hash] ?? null
}

/**
 * The element each anchored note still points at, by note id, as `indexAt`
 * reads it under the frame file's current hash. A frame note has no entry.
 */
export async function resolveAnchors(
  pageDir: string,
  notes: Note[],
): Promise<Record<string, number | null>> {
  const frames = [
    ...new Set(notes.filter((note) => note.anchor).map((note) => note.frame)),
  ]
  const hashes = new Map(
    await Promise.all(
      frames.map(
        async (frame) =>
          [
            frame,
            await hashOf(join(pageDir, `${frame}${FRAME_EXTENSION}`)),
          ] as const,
      ),
    ),
  )
  const resolved: Record<string, number | null> = {}
  for (const note of notes) {
    if (!note.anchor) continue
    resolved[note.id] = indexAt(note.anchor, hashes.get(note.frame) ?? null)
  }
  return resolved
}

async function hashOf(path: string): Promise<string | null> {
  try {
    return contentHash(await readFile(path))
  } catch (error) {
    if (isCode(error, 'ENOENT')) return null
    throw error
  }
}
