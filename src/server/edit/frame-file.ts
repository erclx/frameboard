import { readFileSync, renameSync, rmSync, writeFileSync } from 'node:fs'
import { basename, dirname, join } from 'node:path'

import { contentHash, type Element, hasTag, parseFrame } from './address'
import {
  applyEdit,
  type EditChange,
  type EditRefused,
  type ElementAddress,
  refuse,
  scopeOf,
} from './apply'
import { type ElementSpan, relocate, spanText } from './element-span'
import {
  type InsertedSpan,
  insertElement,
  type MovedSpan,
  moveElement,
  type Placement,
  removeElement,
} from './insert'
import {
  type Placed,
  type PlacedSize,
  placeElement,
  type PlaceFacts,
  type Spot,
} from './place'
import { type Recolor, recolorElements } from './recolor'

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
      /** Every element keeps its index, since an edit writes inside one. */
      readonly remap: Remap
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

/**
 * Where a write carried each element of the frame, from its index in the
 * bytes written over to its index in the bytes written, or null for an element
 * the write took out.
 */
export type Remap = (index: number) => number | null

const identity: Remap = (index) => index

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
    remap: identity,
  }
}

/** One element's change in a batch, by its index in the bytes the batch was made from. */
export interface ElementEdit {
  readonly index: number
  readonly change: EditChange
}

export type FrameFileEdits =
  | {
      readonly ok: true
      /** The file's hash after the edits, which the next edit is made from. */
      readonly hash: string
      /** The hash the edits were written over, which differs from the sent one once relocated. */
      readonly from: string
      /** Each edit's element index in the file as written, in the order sent. */
      readonly indexes: readonly number[]
      /** Each edited element's bytes, in the order sent, which one undo puts back together. */
      readonly spans: readonly ElementSpan[]
      /** Every element keeps its index, since an edit writes inside one. */
      readonly remap: Remap
    }
  | EditRefused
  | Collided

/**
 * Edits several elements of a frame file as one write, each found again and
 * verified as `editFrameFile` does one, in the order sent through the bytes
 * the one before it left. Any refusal writes nothing, so a batch never lands
 * in part, and naming one element twice is refused since one undo could not
 * put both spans back.
 */
export function editFrameFileAll(
  path: string,
  hash: string,
  edits: readonly ElementEdit[],
  sourceAt?: SourceAt,
): FrameFileEdits {
  const read = readSource(path)
  if (!read.ok) return read
  const { source } = read
  const indexes: number[] = []
  for (const { index, change } of edits) {
    if (hash === read.hash) {
      indexes.push(index)
      continue
    }
    const was = sourceAt?.(hash)
    if (!was) return stale(path)
    const found = relocate(was, index, scopeOf(change), source)
    if (!found) return collided(path, was, index, source)
    indexes.push(found.index)
  }
  if (new Set(indexes).size !== indexes.length) {
    return refuse('invalid-edit', 'a batch names one element twice')
  }
  let html = source
  const spans: ElementSpan[] = []
  for (const [at, { change }] of edits.entries()) {
    const applied = applyEdit(html, { index: indexes[at] ?? -1 }, change)
    if (!applied.ok) return applied
    html = applied.html
    spans.push(applied.span)
  }
  if (!replaceFile(path, read.hash, html)) return stale(path)
  return {
    ok: true,
    hash: contentHash(html),
    from: read.hash,
    indexes,
    spans,
    remap: identity,
  }
}

export type FrameFileInsert =
  | {
      readonly ok: true
      /** The file's hash after the insert, which the next write is made from. */
      readonly hash: string
      /** The new element's index in the file as written. */
      readonly index: number
      /** The new element as it was written, placed or not. */
      readonly span: InsertedSpan
      /** The parent's start tag, when a placement wrote `position: relative` on it. */
      readonly parent: ElementSpan | null
      readonly remap: Remap
    }
  | EditRefused

/**
 * Places the element an insert wrote at `index` in `html`, the inserted
 * source, as `placeElement` does, so the cascade facts it reads are the
 * inserted source's own.
 */
export type PlaceInserted = (html: string, index: number) => Placed

/**
 * Writes one new element into a frame file the way `editFrameFile` writes an
 * edit, through a temporary file and a rename after reading the file again.
 * A hash the file no longer has is refused as stale with no search, since the
 * gap's indices name nothing once the file moved, which also lands a retried
 * insert at most once.
 *
 * Given `place`, the element is placed out of the flow in the same write.
 * Its span then carries the element's placed bytes, and `parent` the start
 * tag a static parent took, so undoing both changes as one step takes the
 * element out after the parent's tag goes back, and a redo finds the gap
 * under the parent as it first stood.
 */
export function insertFrameFile(
  path: string,
  hash: string,
  placement: Placement,
  markup: string,
  place?: PlaceInserted,
): FrameFileInsert {
  const read = readSource(path)
  if (!read.ok) return read
  if (read.hash !== hash) return stale(path)
  const inserted = insertElement(read.source, placement, markup)
  if (!inserted.ok) return inserted
  const placed = place?.(inserted.html, inserted.index)
  if (placed && !placed.ok) return placed
  const html = placed ? placed.html : inserted.html
  const element = parseFrame(html).elements[inserted.index]
  if (!element) return stale(path)
  if (!replaceFile(path, hash, html)) return stale(path)
  return {
    ok: true,
    hash: contentHash(html),
    index: inserted.index,
    span: { ...inserted.span, markup: spanText(html, element, 'element') },
    parent:
      placed && placed.spans.length > 1 ? (placed.spans[0] ?? null) : null,
    remap: shiftedPast(inserted.index, subtreeSize(html, inserted.index)),
  }
}

export type FrameFileRemove =
  | {
      readonly ok: true
      /** The file's hash after the delete, which the next write is made from. */
      readonly hash: string
      /** The deleted element as `restoreInserted` puts it back. */
      readonly span: InsertedSpan
      readonly remap: Remap
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
  return {
    ok: true,
    hash: contentHash(removed.html),
    span: removed.span,
    remap: takenOut(index, subtreeSize(read.source, index)),
  }
}

export type FrameFileRemoveAll =
  | {
      readonly ok: true
      readonly hash: string
      /** The deleted elements in the order taken out, last in the file first. */
      readonly spans: readonly InsertedSpan[]
      readonly remap: Remap
    }
  | EditRefused

/**
 * Takes several elements out of a frame file as one write, refused as
 * `removeFrameFile` refuses one. Each goes last in the file first, so the
 * indices ahead of it hold, and one inside another named element goes with
 * that one rather than on its own.
 */
export function removeFrameFileAll(
  path: string,
  hash: string,
  indexes: readonly number[],
): FrameFileRemoveAll {
  const read = readSource(path)
  if (!read.ok) return read
  if (read.hash !== hash) return stale(path)
  const { elements } = parseFrame(read.source)
  const named = new Set<unknown>(indexes.map((index) => elements[index]))
  const outermost = [...new Set(indexes)].filter((index) => {
    let node: unknown = elements[index]?.parentNode
    while (node && typeof node === 'object') {
      if (named.has(node)) return false
      node = 'parentNode' in node ? node.parentNode : null
    }
    return true
  })
  let html = read.source
  const spans: InsertedSpan[] = []
  const remaps: Remap[] = []
  for (const index of outermost.toSorted((a, b) => b - a)) {
    const size = subtreeSize(html, index)
    const removed = removeElement(html, index)
    if (!removed.ok) return removed
    html = removed.html
    spans.push(removed.span)
    remaps.push(takenOut(index, size))
  }
  if (!replaceFile(path, hash, html)) return stale(path)
  return {
    ok: true,
    hash: contentHash(html),
    spans,
    remap: (index) =>
      remaps.reduce<number | null>(
        (at, remap) => (at === null ? null : remap(at)),
        index,
      ),
  }
}

export type FrameFileMove =
  | {
      readonly ok: true
      readonly hash: string
      /** The moved element's index in the file as written. */
      readonly index: number
      readonly span: MovedSpan
      readonly remap: Remap
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
    remap: carried(index, moved.index, subtreeSize(read.source, index)),
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
      /** Every element keeps its index, since a placement writes start tags alone. */
      readonly remap: Remap
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
    remap: identity,
  }
}

/** One element's placement in a batch, by its index in the bytes the batch was made from. */
export interface ElementPlace {
  readonly index: number
  readonly spot: Spot | null
  /** Back in flow, the sizes to drop. */
  readonly drop?: readonly PlacedSize[]
}

export type FrameFilePlaceAll =
  | {
      readonly ok: true
      readonly hash: string
      /** Every start tag written, in the order written, which one undo puts back together. */
      readonly spans: readonly ElementSpan[]
      /** The sizes each placement wrote, in the order sent. */
      readonly sized: readonly (readonly PlacedSize[])[]
      /** Every element keeps its index, since a placement writes start tags alone. */
      readonly remap: Remap
    }
  | EditRefused

/**
 * Places several elements of a frame file as one write, refused whole as
 * `placeFrameFile` refuses one. They go in file order, so a parent placed too
 * is positioned ahead of its child, which then writes no second span on its
 * tag that would strand the undo. `factsOf` reads the static cascade of the
 * bytes the one before left, so siblings share the parent the first one made
 * relative rather than writing it twice.
 */
export function placeFrameFileAll(
  path: string,
  hash: string,
  places: readonly ElementPlace[],
  factsOf: (html: string) => readonly PlaceFacts[],
): FrameFilePlaceAll {
  const read = readSource(path)
  if (!read.ok) return read
  if (read.hash !== hash) return stale(path)
  let html = read.source
  const spans: ElementSpan[] = []
  const sized = new Map<ElementPlace, readonly PlacedSize[]>()
  for (const place of places.toSorted((a, b) => a.index - b.index)) {
    const { index, spot, drop } = place
    const placed = placeElement(html, index, spot, factsOf(html), drop ?? [])
    if (!placed.ok) return placed
    html = placed.html
    spans.push(...placed.spans)
    sized.set(place, placed.sized)
  }
  if (!replaceFile(path, hash, html)) return stale(path)
  return {
    ok: true,
    hash: contentHash(html),
    spans,
    sized: places.map((place) => sized.get(place) ?? []),
    remap: identity,
  }
}

export type FrameFileRecolor =
  | {
      readonly ok: true
      /** The file's hash after the replace, the one sent when nothing stated the color inline. */
      readonly hash: string
      /** Each rewritten element's start tag, empty when nothing was written. */
      readonly spans: readonly ElementSpan[]
      /** Every element keeps its index, since a replace writes start tags alone. */
      readonly remap: Remap
    }
  | EditRefused

/**
 * Replaces a raw color with a token across the subtree `root` names, or the
 * frame's body when undefined, written as `placeFrameFile` writes and refused
 * as stale on a hash the file no longer has, so a retried replace lands once.
 * A subtree stating the color nowhere inline writes nothing.
 */
export function recolorFrameFile(
  path: string,
  hash: string,
  root: number | undefined,
  recolor: Recolor,
): FrameFileRecolor {
  const read = readSource(path)
  if (!read.ok) return read
  if (read.hash !== hash) return stale(path)
  const recolored = recolorElements(read.source, root, recolor)
  if (!recolored.ok) return recolored
  if (recolored.spans.length === 0) {
    return { ok: true, hash, spans: [], remap: identity }
  }
  if (!replaceFile(path, hash, recolored.html)) return stale(path)
  return {
    ok: true,
    hash: contentHash(recolored.html),
    spans: recolored.spans,
    remap: identity,
  }
}

/** Elements written in at `at`, `size` of them with the descendants, push every later one on. */
function shiftedPast(at: number, size: number): Remap {
  return (index) => (index < at ? index : index + size)
}

/** Elements taken out from `at`, `size` of them, map to nothing and pull every later one back. */
function takenOut(at: number, size: number): Remap {
  return (index) => {
    if (index < at) return index
    return index < at + size ? null : index - size
  }
}

/** A subtree of `size` elements carried from `from` to `to`, both in document order. */
function carried(from: number, to: number, size: number): Remap {
  const out = takenOut(from, size)
  const into = shiftedPast(to, size)
  return (index) => {
    if (index >= from && index < from + size) return to + index - from
    const rest = out(index)
    return rest === null ? null : into(rest)
  }
}

/** The element at `index` with its descendants, which run on from it in document order. */
function subtreeSize(source: string, index: number): number {
  const element = parseFrame(source).elements[index]
  const count = (node: Element): number =>
    node.childNodes.reduce(
      (total, child) => (hasTag(child) ? total + count(child) : total),
      1,
    )
  return element ? count(element) : 1
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
