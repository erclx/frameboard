import { existsSync } from 'node:fs'
import { join, resolve } from 'node:path'

import type { Command } from 'commander'

import { checkReferences, syncReferences } from '@/server/references/sync'
import { FrameboardError } from '@/shared/errors'
import type { ReferencesCheck } from '@/shared/records/references'

import {
  act,
  addVerb,
  boardOf,
  type CommonOptions,
  type ProgramContext,
} from '../program'

type SyncOptions = CommonOptions & { check?: boolean }

export function registerReferences(
  program: Command,
  context: ProgramContext & { facesDir: string },
): void {
  const { io } = context
  const references = program
    .command('references')
    .description("Fill a folder of design references from the board's frames")

  const command = addVerb(
    references,
    'sync',
    "Write each frame <folder>/frames.json maps as its HTML, a PNG per theme, and the project assets it loads, removing every other file below the folder's first level",
  )
    .argument('<folder>', 'the folder holding frames.json')
    .option(
      '--check',
      'write nothing, and exit 14 when the folder differs from what a sync would write',
    )

  act<SyncOptions>(command, context, async ([given = ''], options) => {
    const folder = resolve(io.cwd, given)
    if (!existsSync(join(folder, 'frames.json'))) {
      throw new FrameboardError(
        'usage',
        `${folder} holds no frames.json, mapping each reference to a board frame.`,
      )
    }
    const root = await boardOf(options, io)
    const target = { root, folder, facesDir: context.facesDir }

    if (options.check) {
      const result = await checkReferences(target)
      const lines = driftLines(result)
      const stale =
        result.changed.length + result.missing.length + result.stray.length
      if (stale > 0) {
        throw new FrameboardError(
          'references-stale',
          [`${folder} differs from what a sync would write.`, ...lines].join(
            '\n',
          ),
          { ...result },
        )
      }
      return {
        data: result,
        human: [`${folder} matches the board.`, ...lines].join('\n'),
      }
    }

    const result = await syncReferences(target)
    const removed =
      result.removed.length > 0 ? `, removed ${result.removed.length}` : ''
    return {
      data: result,
      human: `Wrote ${result.written.length} files to ${folder}${removed}.`,
    }
  })
}

function driftLines({
  changed,
  missing,
  stray,
  pngDiffers,
}: ReferencesCheck): string[] {
  return [
    ...changed.map((path) => `Changed: ${path}`),
    ...missing.map((path) => `Missing: ${path}`),
    ...stray.map((path) => `Stray: ${path}`),
    ...pngDiffers.map((path) => `Warning: PNG bytes differ: ${path}`),
  ]
}
