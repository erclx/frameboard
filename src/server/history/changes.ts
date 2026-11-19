import { createHash } from 'node:crypto'
import {
  readdir,
  readFile,
  rename,
  rm,
  stat,
  writeFile,
} from 'node:fs/promises'
import { basename, dirname, join } from 'node:path'
import { isDeepStrictEqual } from 'node:util'

import type { Journal, ProjectFiling } from '@/server/board/journal'
import {
  isCode,
  LOCK_SUFFIX,
  readRecord,
  TEMP_SUFFIX,
  writeRecord,
} from '@/server/board/json-record'
import { filingOf, withOff } from '@/server/board/projects'
import {
  emptyProject,
  LAYOUT_FILE,
  layoutSpec,
  PROJECT_FILE,
  projectSpec,
} from '@/server/board/scan'
import { contentHash } from '@/server/edit/address'
import {
  type ElementSpan,
  holdsSpan,
  swapSpan,
} from '@/server/edit/element-span'
import {
  holdsInserted,
  type InsertedSpan,
  type MovedSpan,
  relocateMoved,
  removeInserted,
  restoreInserted,
} from '@/server/edit/insert'
import {
  setTokenSides,
  type TokenSides,
  tokenSides,
  writeTokenSheet,
} from '@/server/look/token-edit'
import { FRAME_EXTENSION } from '@/shared/board-files'
import { type ErrorCode, FrameboardError } from '@/shared/errors'
import type { LayoutEntry, SectionEntry } from '@/shared/records/board'

import { takeOut, trashSlot } from './trash'

/** Which state of a change: as it stood before the step, or as the step left it. */
export type Side = 'before' | 'after'

/**
 * One small thing a step changed, held as its two states. Each is fine
 * enough that an agent's write elsewhere in the same file or folder neither
 * blocks an undo nor is reverted by it.
 */
export type Change =
  /** One frame's entry in one `layout.json`, undefined when it has none. */
  | {
      kind: 'entry'
      layout: string
      frame: string
      before: LayoutEntry | undefined
      after: LayoutEntry | undefined
    }
  /** One section's entry in one `layout.json`, undefined when it has none. */
  | {
      kind: 'section'
      layout: string
      section: string
      before: SectionEntry | undefined
      after: SectionEntry | undefined
    }
  /** The `present` key one `layout.json` holds, undefined when it has none. */
  | { kind: 'present'; layout: string; before: unknown; after: unknown }
  /** The page order one `project.json` holds. */
  | { kind: 'pages'; file: string; before: string[]; after: string[] }
  /** The folder, archive, title, and off-rule keys one `project.json` holds, with the others left as they stand. */
  | {
      kind: 'project'
      file: string
      before: ProjectFiling
      after: ProjectFiling
    }
  /** A file or folder renamed from `from` to `to`. */
  | { kind: 'moved'; from: string; to: string }
  /**
   * A file or folder present on one side only, with the content hash it had
   * there, and the trash slot it waits in on the other.
   */
  | { kind: 'path'; path: string; present: Side; hash: string; slot: string }
  /**
   * A file whose bytes a hand write swapped for others under the same path,
   * the bytes of the side not standing waiting in the trash slot, with each
   * side's content hash.
   */
  | {
      kind: 'replaced'
      path: string
      slot: string
      hashes: Record<Side, string>
    }
  /**
   * One frame an asset rename rewrote, held whole on both sides, so an agent's
   * write anywhere in it overtakes the step rather than being reverted by it.
   */
  | {
      kind: 'rewritten'
      path: string
      ref: string
      before: string
      after: string
    }
  /**
   * One element a hand edit rewrote, held as its span on both sides, so an undo
   * restores it and keeps every other byte as it stands.
   */
  | { kind: 'element'; path: string; ref: string; span: ElementSpan }
  /**
   * One element placed or deleted by hand, matched by its bytes, so an agent's
   * write elsewhere in the file neither blocks the step nor is reverted.
   */
  | {
      kind: 'inserted'
      path: string
      ref: string
      span: InsertedSpan
      present: Side
    }
  /**
   * One hand delete's elements as one chain, since each span's gap holds only
   * with the ones after it still out.
   */
  | {
      kind: 'deleted'
      path: string
      ref: string
      spans: readonly InsertedSpan[]
    }
  /**
   * The one element a hand move took from one gap of a frame file to
   * another. Each side holds it in its own gap, so an undo takes it out of
   * the new one by its bytes and puts it back by its old gap's anchors.
   */
  | { kind: 'relocated'; path: string; ref: string; span: MovedSpan }
  /**
   * One token's declarations in a project token sheet on each side, so an
   * undo puts that token back as the project stated it and keeps every other
   * byte of the sheet as it stands.
   */
  | {
      kind: 'token'
      path: string
      name: string
      before: TokenSides
      after: TokenSides
    }

/** The records a change writes, whose locks are held while it is checked and written. */
export function lockPaths(change: Change): string[] {
  if (
    change.kind === 'entry' ||
    change.kind === 'section' ||
    change.kind === 'present'
  ) {
    return [change.layout]
  }
  if (change.kind === 'pages' || change.kind === 'project') {
    return [change.file]
  }
  return []
}

/**
 * Whether the board still stands as `side` left it, an unreadable record
 * counting as overtaken, since writing it back would overwrite the agent's file.
 */
export async function holds(change: Change, side: Side): Promise<boolean> {
  try {
    return await reads(change, side)
  } catch (error) {
    if (error instanceof FrameboardError && UNREADABLE.has(error.code)) {
      return false
    }
    throw error
  }
}

const UNREADABLE = new Set<ErrorCode>([
  'layout-invalid',
  'project-file-invalid',
])

async function reads(change: Change, side: Side): Promise<boolean> {
  switch (change.kind) {
    case 'entry': {
      const file = await readRecord(change.layout, layoutSpec)
      const stored = file.frames[change.frame]
      return isDeepStrictEqual(stored, withMeasured(change[side], stored))
    }
    case 'section': {
      const file = await readRecord(change.layout, layoutSpec)
      return isDeepStrictEqual(file.sections?.[change.section], change[side])
    }
    case 'present': {
      const file = await readRecord(change.layout, layoutSpec)
      return isDeepStrictEqual(file.present, change[side])
    }
    case 'pages': {
      const file = await readRecord(change.file, {
        ...projectSpec,
        empty: emptyProject,
      })
      return isDeepStrictEqual(file.pages, change[side])
    }
    case 'project': {
      const file = await readRecord(change.file, projectSpec)
      return isDeepStrictEqual(filingOf(file), change[side])
    }
    case 'moved': {
      const [present, absent] =
        side === 'after' ? [change.to, change.from] : [change.from, change.to]
      return (await exists(present)) && !(await exists(absent))
    }
    case 'path':
      return change.present === side
        ? (await exists(change.path)) &&
            (await hashPath(change.path)) === change.hash
        : !(await exists(change.path)) && (await exists(change.slot))
    case 'replaced':
      return (
        (await exists(change.path)) &&
        (await exists(change.slot)) &&
        (await hashPath(change.path)) === change.hashes[side]
      )
    case 'rewritten':
      return (
        (await exists(change.path)) &&
        (await readText(change.path)) === change[side]
      )
    case 'element':
      return (
        (await exists(change.path)) &&
        holdsSpan(await readFile(change.path, 'utf8'), change.span, side)
      )
    case 'inserted':
      return (
        (await exists(change.path)) &&
        holdsInserted(
          await readFile(change.path, 'utf8'),
          change.span,
          side === change.present ? 'after' : 'before',
        )
      )
    case 'deleted':
      return (
        (await exists(change.path)) &&
        chainDeleted(
          await readFile(change.path, 'utf8'),
          change,
          OTHER[side],
        ) !== undefined
      )
    case 'token':
      return (await exists(change.path)) && holdsToken(change, side)
    case 'relocated':
      // The frame stands at this side while the move to the other still finds both gaps.
      return (
        (await exists(change.path)) &&
        relocateMoved(
          await readFile(change.path, 'utf8'),
          change.span,
          OTHER[side],
        ) !== undefined
      )
  }
}

/**
 * The step's entry with the stored size on hugged axes, so a measure after a
 * hand move neither overtakes the step nor is reverted by it.
 */
function withMeasured(
  entry: LayoutEntry | undefined,
  stored: LayoutEntry | undefined,
): LayoutEntry | undefined {
  if (!entry || !stored) return entry
  return {
    ...entry,
    ...(entry.hugWidth && stored.hugWidth ? { width: stored.width } : {}),
    ...(entry.hugHeight && stored.hugHeight ? { height: stored.height } : {}),
  }
}

const OTHER: Record<Side, Side> = { before: 'after', after: 'before' }

/**
 * Writes `side` of a change back, under the record's lock, once `holds` read
 * the other side. A hand edit's change answers the frame's content hash as it
 * left it, and every other kind answers undefined.
 */
export async function restore(
  change: Change,
  side: Side,
): Promise<string | undefined> {
  switch (change.kind) {
    case 'entry': {
      const file = await readRecord(change.layout, layoutSpec)
      const frames = { ...file.frames }
      const entry = withMeasured(change[side], frames[change.frame])
      if (entry) frames[change.frame] = entry
      else delete frames[change.frame]
      await writeRecord(change.layout, { ...file, frames })
      return
    }
    case 'section': {
      const file = await readRecord(change.layout, layoutSpec)
      const sections = { ...file.sections }
      const entry = change[side]
      if (entry) sections[change.section] = entry
      else delete sections[change.section]
      await writeRecord(change.layout, { ...file, sections })
      return
    }
    case 'present': {
      const { present: _held, ...file } = await readRecord(
        change.layout,
        layoutSpec,
      )
      const present = change[side]
      await writeRecord(
        change.layout,
        present === undefined ? file : { ...file, present },
      )
      return
    }
    case 'pages': {
      const file = await readRecord(change.file, {
        ...projectSpec,
        empty: emptyProject,
      })
      await writeRecord(change.file, { ...file, pages: change[side] })
      return
    }
    case 'project': {
      const file = await readRecord(change.file, projectSpec)
      const {
        group: _group,
        archived: _archived,
        title: _title,
        ...rest
      } = file
      const { off, ...filing } = change[side]
      await writeRecord(change.file, withOff({ ...rest, ...filing }, off))
      return
    }
    case 'moved':
      if (side === 'before') await rename(change.to, change.from)
      else await rename(change.from, change.to)
      return
    case 'path':
      if (change.present === side) await rename(change.slot, change.path)
      else await takeOut(change.path, change.slot)
      return
    case 'replaced':
      await swapWithSlot(change.path, change.slot)
      return
    case 'rewritten':
      return rewriteFrame(change, (source) =>
        source === change[OTHER[side]]
          ? { html: change[side], keep: () => {} }
          : undefined,
      )
    case 'element':
      return rewriteFrame(change, (source) => {
        const swapped = swapSpan(source, change.span, OTHER[side])
        return (
          swapped && {
            html: swapped.html,
            keep: () => {
              change.span = swapped.span
            },
          }
        )
      })
    case 'inserted':
      return rewriteFrame(change, (source) => {
        const written =
          side === change.present
            ? restoreInserted(source, change.span)
            : removeInserted(source, change.span)
        return (
          written && {
            html: written.html,
            keep: () => {
              change.span = written.span
            },
          }
        )
      })
    case 'deleted':
      return rewriteFrame(change, (source) => {
        const written = chainDeleted(source, change, side)
        return (
          written && {
            html: written.html,
            keep: () => {
              change.spans = written.spans
            },
          }
        )
      })
    case 'relocated':
      return rewriteFrame(change, (source) => {
        const written = relocateMoved(source, change.span, side)
        return (
          written && {
            html: written.html,
            keep: () => {
              change.span = written.span
            },
          }
        )
      })
    case 'token':
      return rewriteToken(change, side)
  }
}

/** Trades the file's bytes for the ones its slot holds, keeping the others in the slot. */
async function swapWithSlot(path: string, slot: string): Promise<void> {
  const aside = `${slot}.swap`
  await rename(path, aside)
  await rename(slot, path)
  await rename(aside, slot)
}

/**
 * The frame with a delete's chain restored or taken out again, undefined when
 * any one's bytes or gap no longer read.
 */
function chainDeleted(
  source: string,
  { spans }: Extract<Change, { kind: 'deleted' }>,
  side: Side,
): { html: string; spans: readonly InsertedSpan[] } | undefined {
  const restoring = side === 'before'
  const write = restoring ? restoreInserted : removeInserted
  let html = source
  const kept: InsertedSpan[] = []
  for (const span of restoring ? spans.toReversed() : spans) {
    const written = write(html, span)
    if (!written) return undefined
    html = written.html
    kept.push(written.span)
  }
  return { html, spans: restoring ? kept.toReversed() : kept }
}

/** Whether the sheet sets the token exactly as `side` holds it, false for a sheet that no longer parses. */
async function holdsToken(
  change: Extract<Change, { kind: 'token' }>,
  side: Side,
): Promise<boolean> {
  try {
    const css = await readFile(change.path, 'utf8')
    return isDeepStrictEqual(tokenSides(css, change.name), change[side])
  } catch (error) {
    if (error instanceof FrameboardError) return false
    throw error
  }
}

/** Writes `side` of a token change, refusing a sheet that changed between its read and the rename. */
async function rewriteToken(
  change: Extract<Change, { kind: 'token' }>,
  side: Side,
): Promise<undefined> {
  const css = await readFile(change.path, 'utf8')
  const written = setTokenSides(css, change.name, change[side])
  if (writeTokenSheet(change.path, contentHash(css), written) === 'stale') {
    throw new FrameboardError(
      'undo-overtaken',
      `An agent changed ${change.name} after your edit, so that step was dropped.`,
      { change: change.kind },
    )
  }
  return undefined
}

/**
 * Writes an element's other side through a rename, redoing it once from fresh
 * bytes when a write lands first, and refusing bytes that fail a UTF-8 round trip.
 */
async function rewriteFrame(
  change: Extract<
    Change,
    { kind: 'element' | 'inserted' | 'deleted' | 'relocated' | 'rewritten' }
  >,
  rewrite: (source: string) => { html: string; keep: () => void } | undefined,
): Promise<string> {
  // A leading dot keeps the temporary file from reading as a frame.
  const temp = join(
    dirname(change.path),
    `.${basename(change.path)}.${process.pid}.tmp`,
  )
  let source = await readText(change.path)
  for (let attempt = 0; source !== undefined && attempt < 2; attempt += 1) {
    const written = rewrite(source)
    if (!written) break
    await writeFile(temp, written.html)
    const now = await readText(change.path)
    if (now === source) {
      await rename(temp, change.path)
      written.keep()
      return contentHash(written.html)
    }
    source = now
  }
  await rm(temp, { force: true })
  throw new FrameboardError(
    'undo-overtaken',
    `An agent changed ${basename(change.path, FRAME_EXTENSION)} after your edit, so that step was dropped.`,
    { change: change.kind },
  )
}

/** A frame file's text, or undefined when its bytes do not survive a UTF-8 round trip. */
async function readText(path: string): Promise<string | undefined> {
  const bytes = await readFile(path)
  const text = bytes.toString('utf8')
  return Buffer.from(text, 'utf8').equals(bytes) ? text : undefined
}

/**
 * The journal one board write reports into, building the changes of one
 * step. A path it takes out waits in the step's trash folder.
 */
export class StepJournal implements Journal {
  readonly changes: Change[] = []

  constructor(
    readonly root: string,
    readonly id: number,
  ) {}

  entry(
    page: string,
    frame: string,
    before: LayoutEntry | undefined,
    after: LayoutEntry | undefined,
  ): void {
    const layout = join(page, LAYOUT_FILE)
    // A frame written twice in one step, as a fold pushing a frame the same write then turns, keeps one change, or undo reads the first after as overtaken.
    const last = this.changes.findLastIndex(
      (change) =>
        change.kind === 'entry' &&
        change.layout === layout &&
        change.frame === frame,
    )
    const held = this.changes[last]
    if (
      held?.kind === 'entry' &&
      this.changes.slice(last + 1).every((change) => change.kind === 'entry')
    ) {
      held.after = after
      return
    }
    this.changes.push({ kind: 'entry', layout, frame, before, after })
  }

  section(
    page: string,
    section: string,
    before: SectionEntry | undefined,
    after: SectionEntry | undefined,
  ): void {
    const layout = join(page, LAYOUT_FILE)
    this.changes.push({ kind: 'section', layout, section, before, after })
  }

  present(page: string, before: unknown, after: unknown): void {
    const layout = join(page, LAYOUT_FILE)
    this.changes.push({ kind: 'present', layout, before, after })
  }

  pages(project: string, before: string[], after: string[]): void {
    const file = join(project, PROJECT_FILE)
    this.changes.push({ kind: 'pages', file, before, after })
  }

  project(file: string, before: ProjectFiling, after: ProjectFiling): void {
    this.changes.push({ kind: 'project', file, before, after })
  }

  async moved(from: string, to: string): Promise<void> {
    await rename(from, to)
    this.changes.push({ kind: 'moved', from, to })
  }

  /** The element a hand edit rewrote in a frame file, which this journal does not write. */
  element(path: string, ref: string, span: ElementSpan): void {
    this.changes.push({ kind: 'element', path, ref, span })
  }

  /** A frame file a hand write rewrote whole on each side, which this journal does not write. */
  rewritten(path: string, ref: string, before: string, after: string): void {
    this.changes.push({ kind: 'rewritten', path, ref, before, after })
  }

  /** The element a placement tool wrote into a frame file, which this journal does not write. */
  inserted(path: string, ref: string, span: InsertedSpan): void {
    this.changes.push({ kind: 'inserted', path, ref, span, present: 'after' })
  }

  /** The element a hand delete took out of a frame file, which this journal does not write. */
  deletedElement(path: string, ref: string, span: InsertedSpan): void {
    this.changes.push({ kind: 'inserted', path, ref, span, present: 'before' })
  }

  /** The elements one hand delete took out of a frame file, in the order taken out, which this journal does not write. */
  deletedElements(
    path: string,
    ref: string,
    spans: readonly InsertedSpan[],
  ): void {
    this.changes.push({ kind: 'deleted', path, ref, spans })
  }

  /** The element a hand move took to another gap of a frame file, which this journal does not write. */
  relocated(path: string, ref: string, span: MovedSpan): void {
    this.changes.push({ kind: 'relocated', path, ref, span })
  }

  /** One token's project declarations a hand token edit rewrote, which this journal does not write. */
  token(
    path: string,
    name: string,
    before: TokenSides,
    after: TokenSides,
  ): void {
    this.changes.push({ kind: 'token', path, name, before, after })
  }

  async created(path: string): Promise<void> {
    this.changes.push({
      kind: 'path',
      path,
      present: 'after',
      hash: await hashPath(path),
      slot: this.#slot(),
    })
  }

  /** Puts the file at `from` in place of `path`, keeping the bytes it replaced in a trash slot. */
  async replaced(path: string, from: string): Promise<void> {
    const before = await hashPath(path)
    const after = await hashPath(from)
    const slot = this.#slot()
    await takeOut(path, slot)
    await rename(from, path)
    this.changes.push({
      kind: 'replaced',
      path,
      slot,
      hashes: { before, after },
    })
  }

  async removed(path: string): Promise<void> {
    const hash = await hashPath(path)
    const slot = this.#slot()
    await takeOut(path, slot)
    this.changes.push({ kind: 'path', path, present: 'before', hash, slot })
  }

  #slot(): string {
    return trashSlot(this.root, this.id, this.changes.length)
  }
}

/**
 * A hash over a file's bytes, or over every file in a folder with its path.
 * Dot-named entries, locks, and temp files are left out, as the scanner
 * leaves them, so a lock taken and released reads as no change.
 */
export async function hashPath(path: string): Promise<string> {
  const hash = createHash('sha256')
  const walk = async (at: string, name: string): Promise<void> => {
    if ((await stat(at)).isDirectory()) {
      hash.update(`d:${name}\0`)
      const children = (await readdir(at)).filter(isHashed).sort()
      for (const child of children)
        await walk(join(at, child), `${name}/${child}`)
    } else {
      hash.update(`f:${name}\0`)
      hash.update(await readFile(at))
      hash.update('\0')
    }
  }
  await walk(path, '.')
  return hash.digest('hex')
}

function isHashed(name: string): boolean {
  return (
    !name.startsWith('.') &&
    !name.endsWith(LOCK_SUFFIX) &&
    !name.endsWith(TEMP_SUFFIX)
  )
}

/**
 * Whether the path exists under exactly this name, read from its folder's
 * listing, so a case-only rename on a case-insensitive volume tells the two
 * names apart.
 */
async function exists(path: string): Promise<boolean> {
  try {
    return (await readdir(dirname(path))).includes(basename(path))
  } catch (error) {
    if (isCode(error, 'ENOENT')) return false
    throw error
  }
}
