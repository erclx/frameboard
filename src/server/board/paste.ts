import { readFile, writeFile } from 'node:fs/promises'
import { dirname, join } from 'node:path'

import { FRAME_GAP } from '@/shared/frame-sizes'
import type { LayoutEntry } from '@/shared/records/board'
import type { FrameRecord } from '@/shared/records/list'

import { freeFrameName, readFrame, withLayouts } from './frames'
import type { JournalOptions } from './journal'
import { type RefOptions, resolveFrameRef, resolvePageRef } from './refs'
import { FRAME_EXTENSION, type Placement } from './scan'

/**
 * A frame as the clipboard holds it: its bytes and its placement as they
 * were when copied, so a paste never reads the source again.
 */
export interface HeldFrame {
  name: string
  /** The page folder it was copied from, so a paste onto it lands beside the source. */
  page: string
  bytes: Buffer
  placement: Placement
  /** Its layout entry as stored, keys a newer writer added included, or undefined when unplaced. */
  entry: LayoutEntry | undefined
}

/** Reads each frame's file and placement under its page's lock, in the order given. */
export async function holdFrames(
  root: string,
  refs: string[],
  options: RefOptions,
): Promise<HeldFrame[]> {
  const frames = await Promise.all(
    refs.map((ref) => resolveFrameRef(root, ref, options)),
  )
  const pages = frames.map((frame) => dirname(frame.path))
  return withLayouts(pages, async (layouts) =>
    Promise.all(
      frames.map(async (frame) => {
        const page = dirname(frame.path)
        const layout = layouts.get(page)
        if (!layout) throw new Error(`No layout read for ${page}.`)
        const entry = layout.file.frames[frame.name]
        return {
          name: frame.name,
          page,
          bytes: await readFile(frame.path),
          placement: layout.placement(frame.name),
          entry: entry && { ...entry },
        }
      }),
    ),
  )
}

/**
 * Writes held frames onto a page as new files on top of its stack, each
 * taking the next free name so nothing on the page is overwritten. A frame
 * keeps its box on another page and lands beside its source on its own,
 * the way `duplicateFrame` places a copy.
 */
export async function pasteFrames(
  root: string,
  pageRef: string,
  held: HeldFrame[],
  options: RefOptions & JournalOptions,
): Promise<FrameRecord[]> {
  const { journal } = options
  const target = await resolvePageRef(root, pageRef, options)
  const names = await withLayouts(
    [target.path],
    async (layouts) => {
      const layout = layouts.get(target.path)
      if (!layout) throw new Error(`No layout read for ${target.path}.`)
      const pasted: string[] = []
      for (const frame of held) {
        const name = freeFrameName(layout.names, frame.name, undefined)
        const { box } = frame.placement
        const path = join(target.path, `${name}${FRAME_EXTENSION}`)
        await writeFile(path, frame.bytes, { flag: 'wx' })
        await journal?.created(path)
        layout.names = [...layout.names, name].sort()
        if (frame.entry) layout.file.frames[name] = { ...frame.entry }
        layout.set(name, {
          ...frame.placement,
          box:
            frame.page === target.path
              ? { ...box, x: box.x + box.width + FRAME_GAP }
              : box,
          order: layout.topOrder(),
        })
        pasted.push(name)
      }
      layout.renumber()
      return pasted
    },
    journal,
  )
  return Promise.all(
    names.map((name) =>
      readFrame(root, `${target.project}/${target.name}/${name}`, options),
    ),
  )
}
