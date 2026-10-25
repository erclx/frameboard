import { type Command, Option } from 'commander'

import {
  addFrame,
  deleteFrame,
  duplicateFrame,
  type FrameFlag,
  moveFrame,
  orderFrame,
  readFrame,
  renameFrame,
  resizeFrame,
  setFrameFlag,
  type SizeOptions,
} from '@/server/board/frames'
import { fitFrame } from '@/server/capture/fit'
import { withFrameHost } from '@/server/capture/host'
import { FRAME_SIZES } from '@/shared/frame-sizes'
import type { FrameRecord } from '@/shared/records/list'

import {
  act,
  addVerb,
  boardOf,
  type CommonOptions,
  parseInteger,
  type ProgramContext,
} from '../program'

const FRAME_REF =
  'a frame ref, <page>/<frame> or <project>/<page>/<frame>, or a path to its .html file'
const ANY_INTEGER = parseInteger(Number.MIN_SAFE_INTEGER)

type FrameOptions = CommonOptions & SizeOptions & { x?: number; y?: number }

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
        new Option('--size <preset>', 'a size preset').choices(
          Object.keys(FRAME_SIZES),
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
          'Place a frame past every frame, writing a skeleton file when none exists. Each axis no size names hugs its content, so a preset or --width fixes the width and the height hugs.',
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
    withSize(verb('resize', 'Set a frame size, fixing each axis it sets')),
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
