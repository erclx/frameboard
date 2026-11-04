import {
  mkdir,
  mkdtemp,
  readdir,
  readFile,
  rm,
  rmdir,
  writeFile,
} from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { dirname, join, relative, sep } from 'node:path'

import { scanBoard } from '@/server/board/scan'
import { withFrameHost } from '@/server/capture/host'
import { captureFrameImages } from '@/server/capture/images'
import { assetsDirOf, readFrame } from '@/server/checks/frame-source'
import { FrameboardError } from '@/shared/errors'
import type { FrameRecord } from '@/shared/records/list'
import type {
  ReferencesCheck,
  ReferencesSync,
} from '@/shared/records/references'
import { THEMES } from '@/shared/theme'

import { frameAssets } from './assets'
import { classifyDrift } from './drift'
import { toReference } from './format'
import { missingFrames, parseFrameMap } from './frame-map'

export interface ReferencesOptions {
  /** The board folder holding the mapped frames. */
  root: string
  /** The folder holding `frames.json`, which the sync fills. */
  folder: string
  /** The folder holding the faces every frame imports. */
  facesDir: string
}

type Output = Map<string, string | Uint8Array>

/**
 * Writes what the board holds into the folder and removes every other file
 * below its first level. It builds the whole output first, so a refusal leaves
 * the folder as it was.
 */
export async function syncReferences(
  options: ReferencesOptions,
): Promise<ReferencesSync> {
  const { folder } = options
  const output = await buildOutput(options)
  const removed = (await heldFiles(folder)).filter((path) => !output.has(path))
  await Promise.all(
    [...output].map(async ([path, data]) => {
      await mkdir(dirname(join(folder, path)), { recursive: true })
      await writeFile(join(folder, path), data)
    }),
  )
  await Promise.all(removed.map((path) => rm(join(folder, path))))
  await removeEmptyFolders(folder, folder)
  return { folder, written: [...output.keys()].sort(), removed: removed.sort() }
}

/** Compares the folder against what a sync would write, writing nothing. */
export async function checkReferences(
  options: ReferencesOptions,
): Promise<ReferencesCheck> {
  const { folder } = options
  const output = await buildOutput(options)
  const held: Output = new Map()
  await Promise.all(
    (await heldFiles(folder)).map(async (path) => {
      held.set(path, await readFile(join(folder, path)))
    }),
  )
  const drift = classifyDrift(output, held)
  return {
    folder,
    changed: [...drift.changed].sort(),
    missing: [...drift.missing].sort(),
    stray: [...drift.stray].sort(),
    pngDiffers: [...drift.pngDiffers].sort(),
  }
}

async function buildOutput({
  root,
  folder,
  facesDir,
}: ReferencesOptions): Promise<Output> {
  const map = parseFrameMap(await readFile(join(folder, 'frames.json'), 'utf8'))
  const frames = await mappedFrames(root, map)

  const output: Output = new Map()
  // Every frame is read and formatted ahead of the browser, so a frame the
  // formatter refuses costs no capture.
  await Promise.all(
    [...map].map(async ([reference, ref]) => {
      const { project, page, name } = frameOf(frames, ref)
      const source = readFrame({ root, project, page, name })
      output.set(`${reference}.html`, await toReference(source, reference))
      for (const asset of frameAssets(source)) {
        output.set(
          join('assets', project, asset),
          await readFile(join(assetsDirOf(source), asset)),
        )
      }
    }),
  )

  // A folder of its own, so a check leaves nothing in the board's captures.
  const captures = await mkdtemp(join(tmpdir(), 'frameboard-references-'))
  try {
    const images = await withFrameHost(
      { root, facesDir },
      'references sync',
      (browser, baseUrl) =>
        captureFrameImages(browser, {
          baseUrl,
          frames: [...frames.values()],
          themes: THEMES,
          out: captures,
        }),
    )
    for (const [reference, ref] of map) {
      for (const image of images.filter((image) => image.ref === ref)) {
        output.set(
          `${reference}-${image.theme}.png`,
          await readFile(image.path),
        )
      }
    }
  } finally {
    await rm(captures, { recursive: true, force: true })
  }
  return output
}

/** The board frame each mapped ref names, each once, or a refusal listing every one it lacks. */
async function mappedFrames(
  root: string,
  map: ReadonlyMap<string, string>,
): Promise<Map<string, FrameRecord>> {
  const { projects } = await scanBoard(root)
  const board = new Map(
    projects
      .flatMap((project) => project.pages)
      .flatMap((page) => page.frames)
      .map((frame) => [frame.ref, frame]),
  )
  const missing = missingFrames(map, new Set(board.keys()))
  if (missing.length > 0) {
    throw new FrameboardError(
      'frame-not-found',
      `No board frame for: ${missing.join(', ')}. Nothing written.`,
      { missing },
    )
  }
  return new Map(
    [...map.values()].map((ref) => [ref, frameOf(board, ref)] as const),
  )
}

function frameOf(
  frames: ReadonlyMap<string, FrameRecord>,
  ref: string,
): FrameRecord {
  const frame = frames.get(ref)
  if (!frame) throw new Error(`${ref} was not resolved.`)
  return frame
}

/** Every file below the folder's first level, which the sync owns. A top-level file is the consumer's own. */
async function heldFiles(folder: string): Promise<string[]> {
  const entries = await readdir(folder, {
    recursive: true,
    withFileTypes: true,
  })
  return entries
    .filter((entry) => entry.isFile())
    .map((entry) => relative(folder, join(entry.parentPath, entry.name)))
    .filter((path) => path.includes(sep))
}

async function removeEmptyFolders(dir: string, folder: string): Promise<void> {
  const entries = await readdir(dir, { withFileTypes: true })
  await Promise.all(
    entries
      .filter((entry) => entry.isDirectory())
      .map((entry) => removeEmptyFolders(join(dir, entry.name), folder)),
  )
  if (dir !== folder && (await readdir(dir)).length === 0) await rmdir(dir)
}
