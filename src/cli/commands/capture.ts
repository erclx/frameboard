import { join, resolve } from 'node:path'

import { type Command, Option } from 'commander'

import { ensureRunFolder } from '@/server/address'
import { resolveFrameRef, resolvePageRef } from '@/server/board/refs'
import { readPageOrder, scanPage } from '@/server/board/scan'
import { withFrameHost } from '@/server/capture/host'
import {
  captureComposite,
  type CapturedImage,
  captureFrameImages,
} from '@/server/capture/images'
import { type Theme, THEMES } from '@/server/capture/render'
import { FrameboardError } from '@/shared/errors'
import type { CaptureResult } from '@/shared/records/capture'
import type { FrameRecord, PageRecord } from '@/shared/records/list'

import {
  act,
  addVerb,
  boardOf,
  type CommonOptions,
  type ProgramContext,
} from '../program'

type CaptureOptions = CommonOptions & {
  page?: string
  composite?: boolean
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
    'Write PNGs of a frame, or of every visible frame of a page, in light, dark, or both',
    { project: true },
  )
    .argument(
      '[frame-ref]',
      'a frame ref, <page>/<frame> or <project>/<page>/<frame>, or a path to its .html file',
    )
    .option(
      '--page <page-ref>',
      'capture every visible frame of this page, <page> or <project>/<page>, in place of one frame',
    )
    .option(
      '--composite',
      'with --page, one image of the page with each frame at its layout position',
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

  act<CaptureOptions>(command, context, async ([ref], options) => {
    // A two-part ref reads as `<page>/<frame>` and `<project>/<page>` alike,
    // so the page form takes its own flag rather than a guess.
    if ((ref === undefined) === (options.page === undefined)) {
      throw new FrameboardError(
        'usage',
        'Pass a frame ref or --page <page-ref>, exactly one of the two.',
      )
    }
    if (options.composite && options.page === undefined) {
      throw new FrameboardError('usage', '--composite needs --page.')
    }
    const root = await boardOf(options, io)
    const refOptions = { project: options.project, cwd: io.cwd }
    const themes = options.theme === 'both' ? THEMES : [options.theme]
    const outOf = async () =>
      options.out
        ? resolve(io.cwd, options.out)
        : join(await ensureRunFolder(root), 'captures')

    if (options.page !== undefined) {
      const page = await pageOf(root, options.page, refOptions)
      const frames = page.frames.filter((frame) => !frame.hidden)
      if (frames.length === 0) {
        return {
          data: { images: [] } satisfies CaptureResult,
          human: `${page.ref} holds no visible frame, so nothing was captured.`,
        }
      }
      const out = await outOf()
      const images = await withFrameHost(root, 'capture', (browser, baseUrl) =>
        options.composite
          ? captureComposite(browser, {
              baseUrl,
              page: { ref: page.ref, project: page.project, name: page.name },
              frames,
              themes,
              out,
            })
          : captureFrameImages(browser, { baseUrl, frames, themes, out }),
      )
      return {
        data: { images } satisfies CaptureResult,
        human: describe(images),
      }
    }

    const frame = await frameOf(root, ref ?? '', refOptions)
    const out = await outOf()
    const images = await withFrameHost(root, 'capture', (browser, baseUrl) =>
      captureFrameImages(browser, { baseUrl, frames: [frame], themes, out }),
    )
    return { data: { images } satisfies CaptureResult, human: describe(images) }
  })
}

async function pageOf(
  root: string,
  ref: string,
  options: { project?: string; cwd: string },
): Promise<PageRecord> {
  const resolved = await resolvePageRef(root, ref, options)
  const { pages } = await readPageOrder(join(root, resolved.project))
  return scanPage(
    root,
    resolved.project,
    resolved.page,
    pages.indexOf(resolved.page),
  )
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
