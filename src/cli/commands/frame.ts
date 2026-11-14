import { Argument, type Command, Option } from 'commander'

import {
  addFrame,
  deleteFrame,
  type DeviceOptions,
  duplicateFrame,
  fitScrollError,
  type FrameFlag,
  moveFrame,
  orderFrame,
  readFrame,
  renameFrame,
  resizeFrame,
  type ScrollOptions,
  setFrameDevice,
  setFrameFlag,
  setFrameTransition,
  type SizeOptions,
  type WidthsOptions,
} from '@/server/board/frames'
import { fitFrame } from '@/server/capture/fit'
import { withFrameHost } from '@/server/capture/host'
import { deviceOf, DEVICES } from '@/shared/frame-device'
import { FRAME_SIZE_NAMES } from '@/shared/frame-sizes'
import { SAME_AS_PAGE_WORD, transitionLabel } from '@/shared/present-transition'
import type { FrameRecord } from '@/shared/records/list'

import {
  act,
  addVerb,
  boardOf,
  type CommonOptions,
  parseInteger,
  type ProgramContext,
} from '../program'
import {
  type TransitionFlags,
  transitionFrom,
  transitionHelp,
  withTransitionFlags,
} from './transition-flags'

const FRAME_REF =
  'a frame ref, <page>/<frame> or <project>/<page>/<frame>, or a path to its .html file'
const ANY_INTEGER = parseInteger(Number.MIN_SAFE_INTEGER)

type FrameOptions = CommonOptions &
  SizeOptions &
  ScrollOptions &
  WidthsOptions &
  DeviceOptions & { x?: number; y?: number }

const DEVICE_HELP =
  'the device the board draws around the frame, leaving the frame file and its size as they are'

const WIDTHS_HELP =
  'the extra widths the frame also shows at, a comma list such as 834,390, each drawn beside it and hugging or holding its height as the frame does'
const POSITIVE = parseInteger(1)

/** A comma list of positive integers, each checked as `--width` checks one. */
function parseWidths(value: string): number[] {
  return value.split(',').map((part) => POSITIVE(part.trim()))
}

const SCROLL_HELP =
  'hold a fixed screen height and scroll past it, fixing both axes, at the reference height of the width when no height is given'
/** The override `frame transition` stores, null for `page`, which clears it. */
function transitionOrPage(name: string, flags: TransitionFlags) {
  return name === SAME_AS_PAGE_WORD ? null : transitionFrom(name, flags)
}

const RESIZE_SCROLL_HELP =
  'hold a fixed screen height and scroll past it, fixing both axes, dropping a hugging height to the reference height of the width and keeping a fixed one'

export function registerFrame(
  program: Command,
  context: ProgramContext & { facesDir: string },
): void {
  const { io } = context
  const frame = program.command('frame').description('Manage frames')
  const verb = (name: string, description: string) =>
    addVerb(frame, name, description, { project: true }).argument(
      '<frame-ref>',
      FRAME_REF,
    )
  const withSize = (command: Command) =>
    command
      .addOption(
        new Option('--size <preset>', 'a size preset or device').choices(
          FRAME_SIZE_NAMES,
        ),
      )
      .option('--width <n>', 'width in px', parseInteger(1))
      .option('--height <n>', 'height in px', parseInteger(1))
  const withPosition = (command: Command) =>
    command
      .option('--x <n>', 'board x in px', ANY_INTEGER)
      .option('--y <n>', 'board y in px', ANY_INTEGER)
  const done = (record: FrameRecord, what: string) => ({
    data: record,
    human: `${what} ${record.ref}`,
  })

  act<FrameOptions>(
    withPosition(
      withSize(
        verb(
          'add',
          'Place a frame past every frame, as written when its file exists and with a skeleton file only when none does, so write the file first to show no empty box. Each axis no size names hugs its content, so a preset or --width fixes the width and the height hugs.',
        )
          .option('--scroll', SCROLL_HELP)
          .option('--widths <list>', WIDTHS_HELP, parseWidths)
          .addOption(
            new Option('--device <device>', DEVICE_HELP).choices(DEVICES),
          ),
      ),
    ),
    context,
    async ([ref = ''], options) =>
      done(
        await addFrame(await boardOf(options, io), ref, {
          ...options,
          cwd: io.cwd,
        }),
        'Added',
      ),
  )

  act<CommonOptions & { to?: string; name?: string }>(
    verb('duplicate', 'Copy a frame file byte for byte, on top')
      .option('--to <page-ref>', 'the page to copy into, defaulting to its own')
      .option(
        '--name <new>',
        'name of the copy, defaulting to the next free -2, -3',
      ),
    context,
    async ([ref = ''], options) =>
      done(
        await duplicateFrame(await boardOf(options, io), ref, {
          ...options,
          cwd: io.cwd,
        }),
        'Duplicated as',
      ),
  )

  act<FrameOptions & { to?: string; name?: string }>(
    withPosition(
      verb(
        'move',
        'Set a frame position, or carry its file to another page or name',
      )
        .option('--to <page-ref>', 'the page to move into')
        .option('--name <new>', 'its new name'),
    ),
    context,
    async ([ref = ''], options) =>
      done(
        await moveFrame(await boardOf(options, io), ref, {
          ...options,
          cwd: io.cwd,
        }),
        'Moved to',
      ),
  )

  act<FrameOptions>(
    withSize(
      verb('resize', 'Set a frame size, fixing each axis it sets')
        .option('--scroll', RESIZE_SCROLL_HELP)
        .option('--no-scroll', 'clear scroll, keeping the box as it stands')
        .option('--widths <list>', WIDTHS_HELP, parseWidths)
        .option('--no-widths', 'clear the extra widths'),
    ),
    context,
    async ([ref = ''], options) =>
      done(
        await resizeFrame(await boardOf(options, io), ref, {
          ...options,
          cwd: io.cwd,
        }),
        'Resized',
      ),
  )

  act<CommonOptions>(
    verb(
      'fit',
      "Set a frame height to its content's own height and hug it from then on, reporting a width too wide for the frame",
    ),
    context,
    async ([ref = ''], options) => {
      const root = await boardOf(options, io)
      const refOptions = { project: options.project, cwd: io.cwd }
      // Resolved ahead of the browser, so a missing frame never reads as a missing browser.
      const frame = await readFrame(root, ref, refOptions)
      if (frame.scroll) throw fitScrollError(frame.ref)
      const result = await withFrameHost(
        { root, facesDir: context.facesDir },
        'frame fit',
        (browser, baseUrl) =>
          fitFrame(browser, { ...refOptions, root, baseUrl, frame }),
      )
      const wide = result.tooWide
        ? `, and its content is ${result.contentWidth} px wide against ${result.frame.box.width}`
        : ''
      return {
        data: result,
        human: `Fit ${result.frame.ref} to ${result.contentHeight} px${wide}`,
      }
    },
  )

  act<CommonOptions & { index: number }>(
    verb('order', 'Set a frame stacking order').requiredOption(
      '--index <n>',
      'position in the stack, 0 at the bottom, clamped',
      parseInteger(0),
    ),
    context,
    async ([ref = ''], options) =>
      done(
        await orderFrame(await boardOf(options, io), ref, {
          ...options,
          cwd: io.cwd,
        }),
        'Reordered',
      ),
  )

  act<CommonOptions>(
    verb('rename', 'Rename a frame file and its layout entry').argument(
      '<new-name>',
      'its new name',
    ),
    context,
    async ([ref = '', newName = ''], options) =>
      done(
        await renameFrame(await boardOf(options, io), ref, newName, {
          ...options,
          cwd: io.cwd,
        }),
        'Renamed to',
      ),
  )

  act<CommonOptions>(
    verb('delete', 'Delete a frame file and its layout entry'),
    context,
    async ([ref = ''], options) => {
      const result = await deleteFrame(await boardOf(options, io), ref, {
        ...options,
        cwd: io.cwd,
      })
      return { data: result, human: `Deleted frame ${result.deleted}` }
    },
  )

  act<CommonOptions>(
    verb(
      'device',
      'Set the device the board draws around a frame, or clear it with none, leaving the frame file and its size as they are',
    ).addArgument(
      new Argument('<device>', 'the device, or none to clear it').choices([
        ...DEVICES,
        'none',
      ]),
    ),
    context,
    async ([ref = '', device = ''], options) => {
      const record = await setFrameDevice(
        await boardOf(options, io),
        ref,
        deviceOf(device),
        { ...options, cwd: io.cwd },
      )
      return done(
        record,
        record.device ? `Set ${record.device} on` : 'Cleared the device on',
      )
    },
  )

  act<CommonOptions & TransitionFlags>(
    withTransitionFlags(
      verb(
        'transition',
        'Set the transition present mode draws as this slide arrives, over its page’s, or clear it with page so it takes the page’s, writing only layout.json',
      ).addArgument(
        new Argument(
          '<transition>',
          transitionHelp(`${SAME_AS_PAGE_WORD} to take the page’s`),
        ),
      ),
    ),
    context,
    async ([ref = '', name = ''], options) => {
      const record = await setFrameTransition(
        await boardOf(options, io),
        ref,
        transitionOrPage(name, options),
        { ...options, cwd: io.cwd },
      )
      return done(
        record,
        record.transition
          ? `Set ${transitionLabel(record.transition.name)} on`
          : 'Cleared the transition on',
      )
    },
  )

  for (const [name, flag] of [
    ['hide', 'hidden'],
    ['lock', 'locked'],
  ] as const satisfies [string, FrameFlag][]) {
    act<CommonOptions & { off?: boolean }>(
      verb(name, `Set a frame ${flag}, or clear it with --off`).option(
        '--off',
        `clear ${flag}`,
      ),
      context,
      async ([ref = ''], options) =>
        done(
          await setFrameFlag(await boardOf(options, io), ref, flag, {
            ...options,
            on: !options.off,
            cwd: io.cwd,
          }),
          options.off ? `Cleared ${flag} on` : `Set ${flag} on`,
        ),
    )
  }
}
