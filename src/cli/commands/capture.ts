import { join, resolve } from 'node:path'

import { type Command, Option } from 'commander'

import { ensureRunFolder } from '@/server/address'
import { resolveFrameRef } from '@/server/board/refs'
import { scanPage } from '@/server/board/scan'
import { withFrameHost } from '@/server/capture/host'
import { type CapturedImage, captureFrameImages } from '@/server/capture/images'
import { type Theme, THEMES } from '@/server/capture/render'
import type { CaptureResult } from '@/shared/records/capture'
import type { FrameRecord } from '@/shared/records/list'

import {
  act,
  addVerb,
  boardOf,
  type CommonOptions,
  type ProgramContext,
} from '../program'

type CaptureOptions = CommonOptions & {
  theme: Theme | 'both'
  out?: string
}

export function registerCapture(
  program: Command,
  context: ProgramContext,
): void {
  const { io } = context
  const command = addVerb(
    program,
    'capture',
    'Write PNGs of a frame in light, dark, or both, at its layout size',
    { project: true },
  )
    .argument(
      '<frame-ref>',
      'a frame ref, <page>/<frame> or <project>/<page>/<frame>, or a path to its .html file',
    )
    .addOption(
      new Option('--theme <theme>', 'the theme to capture')
        .choices(['light', 'dark', 'both'])
        .default('both'),
    )
    .option(
      '--out <dir>',
      "the folder images land in, defaulting to the board's .run/captures/",
    )

  act<CaptureOptions>(command, context, async ([ref = ''], options) => {
    const root = await boardOf(options, io)
    const frame = await frameOf(root, ref, {
      project: options.project,
      cwd: io.cwd,
    })
    const out = options.out
      ? resolve(io.cwd, options.out)
      : join(await ensureRunFolder(root), 'captures')
    const themes = options.theme === 'both' ? THEMES : [options.theme]
    const images = await withFrameHost(root, 'capture', (browser, baseUrl) =>
      captureFrameImages(browser, { baseUrl, frames: [frame], themes, out }),
    )
    const result: CaptureResult = { images }
    return { data: result, human: describe(images) }
  })
}

async function frameOf(
  root: string,
  ref: string,
  options: { project?: string; cwd: string },
): Promise<FrameRecord> {
  const resolved = await resolveFrameRef(root, ref, options)
  const page = await scanPage(root, resolved.project, resolved.page, 0)
  const frame = page.frames.find(
    (candidate) => candidate.name === resolved.name,
  )
  if (!frame)
    throw new Error(`Frame ${resolved.name} vanished from ${page.ref}.`)
  return frame
}

function describe(images: CapturedImage[]): string {
  return images.map((image) => `Wrote ${image.path}`).join('\n')
}
