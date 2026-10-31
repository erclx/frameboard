import { readFileSync, renameSync, rmSync, writeFileSync } from 'node:fs'
import { basename, dirname, join } from 'node:path'

import { contentHash, parseFrame } from './address'
import {
  applyEdit,
  type EditChange,
  type EditRefused,
  type ElementAddress,
  refuse,
  scopeOf,
} from './apply'
import { type ElementSpan, relocate } from './element-span'
import {
  type InsertedSpan,
  insertElement,
  type MovedSpan,
  moveElement,
  type Placement,
  removeElement,
} from './insert'
import {
  type PlacedSize,
  placeElement,
  type PlaceFacts,
  type Spot,
} from './place'

export type FrameFileEdit =
  | {
      readonly ok: true
      /** The file's hash after the edit, which the next edit is made from. */
      readonly hash: string
      /** The hash the edit was written over, which differs from the address's once relocated. */
      readonly from: string
      /** The element's index in the file as written. */
      readonly index: number
      readonly span: ElementSpan
    }
  | EditRefused
  | Collided

/**
 * A stale edit whose element the agent changed. `moved` says the frame's
 * element count changed too, so the sent index may now name another element.
 */
export interface Collided extends EditRefused {
  readonly moved: boolean
}

/** The source a frame held under a hash it no longer has, or null when none is kept. */
export type SourceAt = (hash: string) => string | null

function stale(path: string): EditRefused {
  return refuse(
    'stale-address',
    `${basename(path)} changed after this edit was made, so nothing was written`,
  )
}

function collided(
  path: string,
  was: string,
  index: number,
  source: string,
): EditRefused | Collided {
  const old = parseFrame(was).elements
  const element = old[index]
  if (!element) return stale(path)
  return {
    ...refuse(
      'stale-address',
      `the agent changed this <${element.tagName}> in ${basename(path)} while your edit waited, so nothing was written`,
    ),
    moved: parseFrame(source).elements.length !== old.length,
  }
}

/**
 * Edits one element of a frame file and replaces the file through a
 * temporary file and a rename. A file whose bytes do not survive a UTF-8
 * round trip is refused, since decoding would rewrite every invalid byte. An
 * address carrying a hash the file no longer has is found again through
 * `sourceAt`, by the bytes the edit reads, and refused as stale when no source
 * is kept or those bytes changed. The file is read again just before the
 * rename so a write landing meanwhile is refused rather than overwritten. No
 * lock is taken, since an agent's raw write never takes one and the hash is
 * what protects a hand edit.
 */
export function editFrameFile(
  path: string,
  address: ElementAddress,
  change: EditChange,
  sourceAt?: SourceAt,
): FrameFileEdit {
  const read = readSource(path)
  if (!read.ok) return read
  const { source, hash } = read
  let index = address.index
  if (address.hash !== undefined && address.hash !== hash) {
    const was = sourceAt?.(address.hash)
    if (!was) return stale(path)
    const found = relocate(was, address.index, scopeOf(change), source)
    if (!found) return collided(path, was, address.index, source)
    index = found.index
  }

  const applied = applyEdit(source, { index }, change)
  if (!applied.ok) return applied
  if (!replaceFile(path, hash, applied.html)) return stale(path)
  return {
    ok: true,
    hash: contentHash(applied.html),
    from: hash,
    index,
    span: applied.span,
  }
}

export type FrameFileInsert =
  | {
      readonly ok: true
      /** The file's hash after the insert, which the next write is made from. */
      readonly hash: string
      /** The new element's index in the file as written. */
      readonly index: number
      readonly span: InsertedSpan
    }
  | EditRefused

/**
 * Writes one new element into a frame file the way `editFrameFile` writes an
 * edit, through a temporary file and a rename after reading the file again.
 * A hash the file no longer has is refused as stale with no search, since the
 * gap's indices name nothing once the file moved, which also lands a retried
 * insert at most once.
 */
export function insertFrameFile(
  path: string,
  hash: string,
  placement: Placement,
  markup: string,
): FrameFileInsert {
  const read = readSource(path)
  if (!read.ok) return read
  if (read.hash !== hash) return stale(path)
  const inserted = insertElement(read.source, placement, markup)
  if (!inserted.ok) return inserted
  if (!replaceFile(path, hash, inserted.html)) return stale(path)
  return {
    ok: true,
    hash: contentHash(inserted.html),
    index: inserted.index,
    span: inserted.span,
  }
}

export type FrameFileRemove =
  | {
      readonly ok: true
      /** The file's hash after the delete, which the next write is made from. */
      readonly hash: string
      /** The deleted element as `restoreInserted` puts it back. */
      readonly span: InsertedSpan
    }
  | EditRefused

/**
 * Takes one element out of a frame file the way `insertFrameFile` writes one
 * in, refusing a hash the file no longer has as stale, so a retried delete
 * takes out at most one element.
 */
export function removeFrameFile(
  path: string,
  hash: string,
  index: number,
): FrameFileRemove {
  const read = readSource(path)
  if (!read.ok) return read
  if (read.hash !== hash) return stale(path)
  const removed = removeElement(read.source, index)
  if (!removed.ok) return removed
  if (!replaceFile(path, hash, removed.html)) return stale(path)
  return { ok: true, hash: contentHash(removed.html), span: removed.span }
}

export type FrameFileMove =
  | {
      readonly ok: true
      readonly hash: string
      /** The moved element's index in the file as written. */
      readonly index: number
      readonly span: MovedSpan
    }
  | EditRefused

/**
 * Moves one element of a frame file into another gap, written as
 * `insertFrameFile` writes, and refused as stale on a hash the file no longer
 * has, since both indices name nothing once the file moved.
 */
export function moveFrameFile(
  path: string,
  hash: string,
  index: number,
  placement: Placement,
): FrameFileMove {
  const read = readSource(path)
  if (!read.ok) return read
  if (read.hash !== hash) return stale(path)
  const moved = moveElement(read.source, index, placement)
  if (!moved.ok) return moved
  if (!replaceFile(path, hash, moved.html)) return stale(path)
  return {
    ok: true,
    hash: contentHash(moved.html),
    index: moved.index,
    span: moved.span,
  }
}

export type FrameFilePlace =
  | {
      readonly ok: true
      readonly hash: string
      /** The parent's start tag first when it was written, then the element's. */
      readonly spans: readonly ElementSpan[]
      /** The sizes the placement wrote. */
      readonly sized: readonly PlacedSize[]
    }
  | EditRefused

/**
 * Places one element of a frame file at a spot, or puts it back in the flow
 * dropping the sizes `drop` names,
 * written as `moveFrameFile` writes and refused as stale on a hash the file
 * no longer has. `facts` is the static cascade read from the bytes `hash`
 * names, so a parent's position is never read from another version.
 */
export function placeFrameFile(
  path: string,
  hash: string,
  index: number,
  spot: Spot | null,
  facts: readonly PlaceFacts[],
  drop: readonly PlacedSize[] = [],
): FrameFilePlace {
  const read = readSource(path)
  if (!read.ok) return read
  if (read.hash !== hash) return stale(path)
  const placed = placeElement(read.source, index, spot, facts, drop)
  if (!placed.ok) return placed
  if (!replaceFile(path, hash, placed.html)) return stale(path)
  return {
    ok: true,
    hash: contentHash(placed.html),
    spans: placed.spans,
    sized: placed.sized,
  }
}

/**
 * A frame file's text and hash. Bytes that do not survive a UTF-8 round trip
 * are refused, since decoding would rewrite every invalid byte.
 */
function readSource(
  path: string,
):
  | { readonly ok: true; readonly source: string; readonly hash: string }
  | EditRefused {
  const bytes = readFileSync(path)
  const source = bytes.toString('utf8')
  if (!Buffer.from(source, 'utf8').equals(bytes)) {
    return refuse(
      'invalid-utf8',
      `${basename(path)} is not valid UTF-8, so writing it back would change bytes outside the edit`,
    )
  }
  return { ok: true, source, hash: contentHash(bytes) }
}

/**
 * Replaces the file with `html` while it still holds the bytes `hash` names,
 * read again just before the rename. Answers false, leaving the newer bytes,
 * when a write landed meanwhile.
 */
function replaceFile(path: string, hash: string, html: string): boolean {
  // A leading dot keeps the temporary file from reading as a frame.
  const temp = join(dirname(path), `.${basename(path)}.${process.pid}.tmp`)
  writeFileSync(temp, html)
  if (contentHash(readFileSync(path)) !== hash) {
    rmSync(temp, { force: true })
    return false
  }
  renameSync(temp, path)
  return true
}
