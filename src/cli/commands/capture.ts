import { join, resolve } from 'node:path'

import { type Command, InvalidArgumentError, Option } from 'commander'

import { ensureRunFolder } from '@/server/address'
import { readFrame } from '@/server/board/frames'
import { resolvePageRef } from '@/server/board/refs'
import { readPageOrder, scanPage } from '@/server/board/scan'
import { withFrameHost } from '@/server/capture/host'
import {
  captureComposite,
  type CapturedImage,
  captureFrameImages,
  captureMotionImages,
} from '@/server/capture/images'
import { FrameboardError } from '@/shared/errors'
import type { CaptureResult } from '@/shared/records/capture'
import type { PageRecord } from '@/shared/records/list'
import { type Theme, THEMES } from '@/shared/theme'

import {
  act,
  addVerb,
  boardOf,
  type CommonOptions,
  parseInteger,
  type ProgramContext,
} from '../program'

type CaptureOptions = CommonOptions & {
  page?: string
  composite?: boolean
  theme: Theme | 'both'
  scale: number
  scroll?: number
  at?: number[]
  filmstrip?: number
  out?: string
}

export function registerCapture(
  program: Command,
  context: ProgramContext & { facesDir: string },
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
    .addOption(
      new Option(
        '--scale <n>',
        'device pixels per CSS pixel, adding @<n>x to the file name past 1',
      )
        .default(1)
        .argParser(parseScale),
    )
    .option(
      '--scroll <px>',
      'shoot a scroll frame this far down, clamped to the end of its page, adding .scroll-<px> to the file name',
      parseInteger(0),
    )
    .option(
      '--at <ms,...>',
      'hold the frame at each of these moments of its timeline, in ms, one image apiece, adding .at-<ms> to the file name',
      parseMoments,
    )
    .option(
      '--filmstrip <n>',
      'one image of n moments spaced from the start of the timeline to its end, adding .filmstrip-<n> to the file name',
      parseInteger(2),
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
    if (options.scroll !== undefined && options.page !== undefined) {
      throw new FrameboardError(
        'usage',
        '--scroll shoots one frame, so pass a frame ref rather than --page.',
      )
    }
    const timing =
      options.at !== undefined
        ? { at: options.at }
        : options.filmstrip !== undefined
          ? { filmstrip: options.filmstrip }
          : undefined
    if (options.at !== undefined && options.filmstrip !== undefined) {
      throw new FrameboardError('usage', 'Pass --at or --filmstrip, not both.')
    }
    if (timing !== undefined && options.page !== undefined) {
      throw new FrameboardError(
        'usage',
        '--at and --filmstrip seek one frame, so pass a frame ref rather than --page.',
      )
    }
    if (timing !== undefined && options.scroll !== undefined) {
      throw new FrameboardError(
        'usage',
        '--at and --filmstrip shoot the frame at the top, so drop --scroll.',
      )
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
      const images = await withFrameHost(
        { root, facesDir: context.facesDir },
        'capture',
        (browser, baseUrl) =>
          options.composite
            ? captureComposite(browser, {
                baseUrl,
                page: { ref: page.ref, project: page.project, name: page.name },
                frames,
                themes,
                out,
                scale: options.scale,
              })
            : captureFrameImages(browser, {
                baseUrl,
                frames,
                themes,
                out,
                scale: options.scale,
              }),
      )
      return {
        data: { images } satisfies CaptureResult,
        human: describe(images),
      }
    }

    const frame = await readFrame(root, ref ?? '', refOptions)
    // A frame without the key never overflows by design, so a scrolled shot
    // would show a state the board never draws.
    if (options.scroll !== undefined && !frame.scroll) {
      throw new FrameboardError(
        'usage',
        `${frame.ref} holds no scroll key, so it has nothing to scroll. Set it with frame resize --scroll first.`,
        { ref: frame.ref },
      )
    }
    const out = await outOf()
    if (timing !== undefined) {
      const { images, motion } = await withFrameHost(
        { root, facesDir: context.facesDir },
        'capture',
        (browser, baseUrl) =>
          captureMotionImages(browser, {
            baseUrl,
            frame,
            themes,
            out,
            scale: options.scale,
            timing,
          }),
      )
      return {
        data: {
          images,
          ...(motion === null ? {} : { motion }),
        } satisfies CaptureResult,
        human: describe(images),
      }
    }
    const images = await withFrameHost(
      { root, facesDir: context.facesDir },
      'capture',
      (browser, baseUrl) =>
        captureFrameImages(browser, {
          baseUrl,
          frames: [frame],
          themes,
          out,
          scale: options.scale,
          scroll: options.scroll,
        }),
    )
    return { data: { images } satisfies CaptureResult, human: describe(images) }
  })
}

// An argument parser replaces commander's choices check, so the parser holds it.
function parseScale(value: string): number {
  if (value !== '1' && value !== '2' && value !== '3') {
    throw new InvalidArgumentError('Expected 1, 2, or 3.')
  }
  return Number(value)
}

// A comma list of whole milliseconds in the order given, a repeat dropped
// since it would write the same file twice.
function parseMoments(value: string): number[] {
  const moments = value.split(',').map((part) => part.trim())
  if (
    !moments.every(
      (part) => /^\d+$/.test(part) && Number.isSafeInteger(Number(part)),
    )
  ) {
    throw new InvalidArgumentError(
      'Expected whole milliseconds, comma separated, such as 0,500,1000.',
    )
  }
  return [...new Set(moments.map(Number))]
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

/** One line per image written, and under it one per video it shows with no picture. */
function describe(images: CapturedImage[]): string {
  return images
    .flatMap((image) => [
      `Wrote ${image.path}`,
      ...(image.videos ?? []).map(
        (video) =>
          `  No picture for the video ${video.src} at element ${video.index} of ${video.ref}, which ${
            video.state === 'error'
              ? 'failed to load'
              : 'was still loading when the load budget ran out'
          }`,
      ),
    ])
    .join('\n')
}
