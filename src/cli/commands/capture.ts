import { join, resolve } from 'node:path'

import { type Command, InvalidArgumentError, Option } from 'commander'

import { ensureRunFolder } from '@/server/address'
import { readFrame } from '@/server/board/frames'
import { resolvePageRef, resolveProject } from '@/server/board/refs'
import { readPageOrder, scanPage, scanProject } from '@/server/board/scan'
import { withFrameHost } from '@/server/capture/host'
import {
  captureComposites,
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
  allPages?: boolean
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
    'Write PNGs of a frame, or of every visible frame of a page or a project, in light, dark, or both',
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
      '--all-pages',
      "capture every visible frame of every page of the project as images alone, in place of one frame. references sync fills a frames.json folder with a design's HTML and assets instead",
    )
    .option(
      '--composite',
      'with --page or --all-pages, one image of each page with each frame at its layout position',
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
    // A two-part ref is ambiguous, so the page form takes its own flag.
    const targets = [ref, options.page, options.allPages].filter(
      (target) => target !== undefined,
    )
    if (targets.length !== 1) {
      throw new FrameboardError(
        'usage',
        'Pass a frame ref, --page <page-ref>, or --all-pages, exactly one of the three.',
      )
    }
    const pageFlag = options.allPages
      ? '--all-pages'
      : options.page !== undefined
        ? '--page'
        : undefined
    if (options.composite && pageFlag === undefined) {
      throw new FrameboardError(
        'usage',
        '--composite needs --page or --all-pages.',
      )
    }
    if (options.scroll !== undefined && pageFlag !== undefined) {
      throw new FrameboardError(
        'usage',
        `--scroll shoots one frame, so pass a frame ref rather than ${pageFlag}.`,
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
    if (timing !== undefined && pageFlag !== undefined) {
      throw new FrameboardError(
        'usage',
        `--at and --filmstrip seek one frame, so pass a frame ref rather than ${pageFlag}.`,
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

    if (pageFlag !== undefined) {
      const { ref: target, pages } =
        options.page === undefined
          ? await projectOf(root, options.project)
          : await pageOf(root, options.page, refOptions)
      const shown = pages
        .map((page) => ({
          ...page,
          frames: page.frames.filter((frame) => !frame.hidden),
        }))
        .filter((page) => page.frames.length > 0)
      if (shown.length === 0) {
        return {
          data: { images: [] } satisfies CaptureResult,
          human: `${target} holds no visible frame, so nothing was captured.`,
        }
      }
      const out = await outOf()
      const images = await withFrameHost(
        { root, facesDir: context.facesDir },
        'capture',
        (browser, baseUrl) =>
          options.composite
            ? captureComposites(browser, {
                baseUrl,
                pages: shown,
                themes,
                out,
                scale: options.scale,
              })
            : captureFrameImages(browser, {
                baseUrl,
                frames: shown.flatMap((page) => page.frames),
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
    // Without `scroll` a frame never overflows, so the board never draws a scrolled one.
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

/** The pages one call captures, and the ref naming them. */
interface PageSet {
  ref: string
  pages: PageRecord[]
}

async function pageOf(
  root: string,
  ref: string,
  options: { project?: string; cwd: string },
): Promise<PageSet> {
  const resolved = await resolvePageRef(root, ref, options)
  const { pages } = await readPageOrder(join(root, resolved.project))
  const page = await scanPage(
    root,
    resolved.project,
    resolved.page,
    pages.indexOf(resolved.page),
  )
  return { ref: page.ref, pages: [page] }
}

async function projectOf(root: string, project?: string): Promise<PageSet> {
  const { name } = await resolveProject(root, project)
  const { pages } = await scanProject(root, name)
  return { ref: name, pages }
}

/** One line per image written, and under it one per video or model it shows with no picture. */
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
      ...(image.models ?? []).map(
        (model) =>
          `  No model drawn for ${model.src} at element ${model.index} of ${model.ref}, which ${
            model.state === 'error'
              ? 'failed to load'
              : 'was still loading when the load budget ran out'
          }`,
      ),
    ])
    .join('\n')
}
