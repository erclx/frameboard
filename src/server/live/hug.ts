import { stat } from 'node:fs/promises'
import { join } from 'node:path'

import { type MeasuredSize, setMeasured } from '@/server/board/frames'
import { LAYOUT_FILE } from '@/server/board/scan'
import type { ContentSize } from '@/server/capture/fit'
import { FrameboardError } from '@/shared/errors'
import { referenceHeight } from '@/shared/frame-sizes'
import type { FrameRecord, ListResult } from '@/shared/records/list'

/**
 * Measures one frame's content on the warm browser, at its box, or at `box`
 * for a linked width, whose width it holds.
 */
export type MeasureFrame = (
  frame: FrameRecord,
  box?: { width: number; height: number },
) => Promise<ContentSize>

export interface Hug {
  /**
   * Measures and writes hugging frames, answering whether `board` now trails a
   * stored size, so the batch rescans before it sends the board.
   */
  now: (board: ListResult, refs: readonly string[]) => Promise<boolean>
  /**
   * Measures and writes the same way, linked widths included, on a queue of
   * its own, holding no batch.
   */
  later: (board: ListResult, refs: readonly string[]) => void
  /** Drops what `later` queued and lands no write after it. */
  close: () => void
}

/**
 * The server's hug step, writing through `setMeasured`, with an unbounded,
 * empty, or failing frame keeping its box.
 */
export function createHug({
  root,
  measure,
}: {
  root: string
  measure: MeasureFrame
}): Hug {
  let queue: Promise<unknown> = Promise.resolve()
  let closed = false

  const run = async (
    board: ListResult,
    refs: readonly string[],
    parts: Parts,
  ): Promise<boolean> => {
    const pages = new Map<
      string,
      { frame: FrameRecord; size: MeasuredSize }[]
    >()
    let stale = false
    for (const frame of huggingFrames(board, refs, parts)) {
      if (closed) return false
      let size: MeasuredSize
      try {
        size = await measureParts(measure, frame, parts)
      } catch (error) {
        if (
          error instanceof FrameboardError &&
          error.code === 'browser-not-found'
        ) {
          break
        }
        continue
      }
      if (Object.keys(size).length === 0) continue
      stale ||=
        (frame.hugWidth &&
          size.width !== undefined &&
          size.width !== frame.box.width) ||
        (frame.hugHeight &&
          size.height !== undefined &&
          size.height !== frame.box.height)
      const page = `${frame.project}/${frame.page}`
      pages.set(page, [...(pages.get(page) ?? []), { frame, size }])
    }
    let written = false
    for (const [page, measured] of pages) {
      if (closed) break
      // Skips a file written since, whose own batch measures it, narrowing the window.
      const unchanged = await Promise.all(
        measured.map(({ frame }) => unchangedSince(frame)),
      )
      const sizes = Object.fromEntries(
        measured
          .filter((_, index) => unchanged[index])
          .map(({ frame, size }) => [frame.name, size]),
      )
      if (Object.keys(sizes).length === 0) continue
      try {
        const names = await setMeasured(root, page, sizes, { cwd: root })
        written ||= names.length > 0
      } catch (error) {
        // An unparsable layout or a removed page has nothing to write.
        if (!(error instanceof FrameboardError)) throw error
      }
    }
    return written || stale
  }

  const enqueue = (
    board: ListResult,
    refs: readonly string[],
    parts: Parts,
  ) => {
    if (closed || huggingFrames(board, refs, parts).length === 0) return
    queue = queue.then(() => run(board, refs, parts)).catch(() => {})
  }

  return {
    now: async (board, refs) => {
      const stale = await run(board, refs, 'own')
      enqueue(board, refs, 'linked')
      return stale
    },
    later: (board, refs) => enqueue(board, refs, 'all'),
    close: () => {
      closed = true
    },
  }
}

/** Which boxes a run measures: the frame's own, its linked widths, or both. */
type Parts = 'own' | 'linked' | 'all'

/**
 * Reads the parts a run asks for, a linked width only on a frame hugging its
 * height. An empty body at the frame's own box, or at every linked width,
 * reads nothing for that part, so the box it stands in for holds.
 */
async function measureParts(
  measure: MeasureFrame,
  frame: FrameRecord,
  parts: Parts,
): Promise<MeasuredSize> {
  const size: MeasuredSize = {}
  if (parts !== 'linked') {
    const own = await measure(frame)
    if (!own.empty)
      Object.assign(size, { width: own.width, height: own.height })
  }
  if (parts !== 'own' && frame.hugHeight && frame.widths.length > 0) {
    const widths = []
    for (const { width } of frame.widths) {
      const linked = await measure(frame, {
        width,
        height: referenceHeight(width),
      })
      if (!linked.empty) widths.push({ width, height: linked.height })
    }
    if (widths.length > 0) size.widths = widths
  }
  return size
}

function huggingFrames(
  board: ListResult,
  refs: readonly string[],
  parts: Parts,
): FrameRecord[] {
  const wanted = new Set(refs)
  return board.projects
    .flatMap((project) => project.pages)
    .flatMap((page) => page.frames)
    .filter(
      (frame) =>
        wanted.has(frame.ref) &&
        frame.placed &&
        (parts === 'linked'
          ? frame.hugHeight && frame.widths.length > 0
          : frame.hugWidth || frame.hugHeight),
    )
}

/**
 * The hugging frames whose file was written after their page's `layout.json`,
 * as one edited while no server ran, which the start sweep measures after
 * the first board goes out. Every other frame's stored size already holds.
 */
export async function writtenSinceLayout(board: ListResult): Promise<string[]> {
  const pages = board.projects.flatMap((project) => project.pages)
  const stale = await Promise.all(
    pages.map(async (page) => {
      const hugging = page.frames.filter(
        (frame) => frame.placed && (frame.hugWidth || frame.hugHeight),
      )
      if (hugging.length === 0) return []
      const layout = await mtimeOf(join(page.path, LAYOUT_FILE))
      return hugging
        .filter((frame) => Date.parse(frame.modifiedAt) > layout)
        .map((frame) => frame.ref)
    }),
  )
  return stale.flat()
}

async function unchangedSince(frame: FrameRecord): Promise<boolean> {
  return new Date(await mtimeOf(frame.path)).toISOString() === frame.modifiedAt
}

async function mtimeOf(path: string): Promise<number> {
  try {
    return (await stat(path)).mtimeMs
  } catch {
    return 0
  }
}

/** The frames a batch reloads through their own file, as against an asset or a token sheet. */
export function ownFileRefs(
  board: ListResult,
  paths: readonly string[],
): string[] {
  const written = new Set(paths)
  return board.projects
    .flatMap((project) => project.pages)
    .flatMap((page) => page.frames)
    .filter((frame) => written.has(frame.path))
    .map((frame) => frame.ref)
}
