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
import {
  frameTargets,
  mappedTarget,
  missingFrames,
  parseFrameMap,
} from './frame-map'
import { keptImages, type ReferenceFiles } from './keep'

export interface ReferencesOptions {
  /** The board folder holding the mapped frames. */
  root: string
  /** The folder holding `frames.json`, which the sync fills. */
  folder: string
  /** The folder holding the faces every frame imports. */
  facesDir: string
}

export interface SyncOptions extends ReferencesOptions {
  /** Write every PNG, keeping none a held frame would. */
  rerender?: boolean
}

type Output = Map<string, string | Uint8Array>

interface Built {
  output: Output
  references: ReferenceFiles[]
}

/**
 * Writes the board into the folder, keeping each PNG `keptImages` names unless
 * `rerender` is set, and removes every other file below its first level. A
 * refusal leaves the folder as it was, since the whole output is built first.
 */
export async function syncReferences(
  options: SyncOptions,
): Promise<ReferencesSync> {
  const { folder, rerender = false } = options
  const { output, references } = await buildOutput(options)
  const files = await heldFiles(folder)
  const kept = rerender
    ? []
    : keptImages(references, output, await readHeld(folder, files))
  const removed = files.filter((path) => !output.has(path))
  const written = [...output.keys()].filter((path) => !kept.includes(path))
  await Promise.all(
    written.map(async (path) => {
      await mkdir(dirname(join(folder, path)), { recursive: true })
      await writeFile(join(folder, path), output.get(path) ?? '')
    }),
  )
  await Promise.all(removed.map((path) => rm(join(folder, path))))
  await removeEmptyFolders(folder, folder)
  return { folder, written: written.sort(), kept, removed: removed.sort() }
}

/** Compares the folder against what a sync would write, writing nothing. */
export async function checkReferences(
  options: ReferencesOptions,
): Promise<ReferencesCheck> {
  const { folder } = options
  const { output } = await buildOutput(options)
  const held = await readHeld(folder, await heldFiles(folder))
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
}: ReferencesOptions): Promise<Built> {
  const map = parseFrameMap(await readFile(join(folder, 'frames.json'), 'utf8'))
  const frames = await mappedFrames(root, map)

  const output: Output = new Map()
  // Formatted ahead of the browser, so a refused frame costs no capture.
  const references = await Promise.all(
    [...map].map(async ([reference, value]): Promise<ReferenceFiles> => {
      const { project, page, name } = frameOf(frames, mappedTarget(value).ref)
      const source = readFrame({ root, project, page, name })
      const html = `${reference}.html`
      output.set(html, await toReference(source, reference, folder))
      const assets: string[] = []
      for (const asset of frameAssets(source)) {
        const path = join('assets', project, asset)
        assets.push(path)
        output.set(path, await readFile(join(assetsDirOf(source), asset)))
      }
      return {
        sources: [html, ...assets],
        images: THEMES.map((theme) => `${reference}-${theme}.png`),
      }
    }),
  )

  // One width per value, so linked widths never stand in for the frame.
  const targets = new Map(
    [...map.values()].map((value) => {
      const { ref, width } = mappedTarget(value)
      const frame = frameOf(frames, ref)
      return [`${ref}@${width ?? frame.box.width}`, { frame, width }] as const
    }),
  )
  // A folder of its own, so a check leaves nothing in the board's captures.
  const captures = await mkdtemp(join(tmpdir(), 'frameboard-references-'))
  try {
    const images = await withFrameHost(
      { root, facesDir },
      'references sync',
      async (browser, baseUrl) => {
        const shot = []
        for (const { frame, width } of targets.values()) {
          shot.push(
            ...(await captureFrameImages(browser, {
              baseUrl,
              frames: [frame],
              themes: THEMES,
              out: captures,
              width: width ?? frame.box.width,
            })),
          )
        }
        return shot
      },
    )
    for (const [reference, value] of map) {
      const { ref, width } = mappedTarget(value)
      const wanted = width ?? frameOf(frames, ref).box.width
      for (const image of images.filter(
        (image) => image.ref === ref && image.width === wanted,
      )) {
        output.set(
          `${reference}-${image.theme}.png`,
          await readFile(image.path),
        )
      }
    }
  } finally {
    await rm(captures, { recursive: true, force: true })
  }
  return { output, references }
}

async function readHeld(folder: string, paths: string[]): Promise<Output> {
  const held: Output = new Map()
  await Promise.all(
    paths.map(async (path) => {
      held.set(path, await readFile(join(folder, path)))
    }),
  )
  return held
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
  const missing = missingFrames(
    map,
    new Set([...board.values()].flatMap(frameTargets)),
  )
  if (missing.length > 0) {
    throw new FrameboardError(
      'frame-not-found',
      `No board frame for: ${missing.join(', ')}. Nothing written.`,
      { missing },
    )
  }
  return new Map(
    [...map.values()].map((value) => {
      const { ref } = mappedTarget(value)
      return [ref, frameOf(board, ref)] as const
    }),
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
