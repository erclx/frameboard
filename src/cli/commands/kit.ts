import { basename, resolve } from 'node:path'

import type { Command } from 'commander'

import { installKit } from '@/server/kits/install'
import { findKit, listKits } from '@/server/kits/list'
import { removeKit } from '@/server/kits/remove'
import { saveKit } from '@/server/kits/save'
import { FrameboardError } from '@/shared/errors'

import {
  act,
  addVerb,
  boardOf,
  type CommonOptions,
  type ProgramContext,
} from '../program'

interface AddOptions extends CommonOptions {
  from?: string
  replace?: boolean
}

export function registerKit(program: Command, context: ProgramContext): void {
  const { io } = context
  const kit = program
    .command('kit')
    .description(
      "Add a design kit to a project for its frames to name, remove one, or save a project's look as a kit",
    )

  act<CommonOptions>(
    addVerb(
      kit,
      'list',
      'List the kits a project can add, the shipped ones first and then the board’s own',
    ),
    context,
    async (_args, options) => {
      const kits = await listKits(await boardOf(options, io))
      return {
        data: kits,
        human: kits
          .map((each) => `${each.name}\t${each.description}`)
          .join('\n'),
      }
    },
  )

  act<AddOptions>(
    addVerb(
      kit,
      'add',
      'Add a kit to a project as a copy under assets/kits/<kit>/, leaving its token sheets alone, so frame kit can set it on a frame. Refuses name-taken where the project already holds a kit by that name, unless --replace puts this copy in its place',
    )
      .argument('<project>', 'the project')
      .argument('[kit]', 'a kit `kit list` names')
      .option('--from <folder>', 'add the kit in this folder instead')
      .option(
        '--replace',
        'put this copy in place of a kit the project already holds by that name, dropping its old files and leaving every frame’s kit as it is',
      ),
    context,
    async ([project = '', name], options) => {
      if ((name === undefined) === (options.from === undefined)) {
        throw new FrameboardError(
          'usage',
          'Name a kit or pass --from <folder>, not both.',
        )
      }
      const root = await boardOf(options, io)
      const folder =
        options.from === undefined ? null : resolve(io.cwd, options.from)
      const found =
        folder === null
          ? findKit(root, name ?? '')
          : { name: basename(folder), path: folder }
      const record = await installKit(root, project, found, {
        replace: options.replace,
      })
      return {
        data: record,
        human: record.replaced
          ? `Replaced ${record.kit} in ${record.project}`
          : `Added ${record.kit} to ${record.project}`,
      }
    },
  )

  act<CommonOptions>(
    addVerb(
      kit,
      'remove',
      'Take a kit out of a project, deleting its folder under assets/kits/ and clearing it from every frame naming it, so each draws with the project’s sheets alone. Refuses kit-not-found for a kit the project holds none under',
    )
      .argument('<project>', 'the project')
      .argument('<kit>', 'a kit the project holds'),
    context,
    async ([project = '', name = ''], options) => {
      const record = await removeKit(await boardOf(options, io), project, name)
      const count = record.frames.length
      return {
        data: record,
        human: `Removed ${record.kit} from ${record.project}, clearing it from ${count} ${count === 1 ? 'frame' : 'frames'}`,
      }
    },
  )

  act<CommonOptions>(
    addVerb(
      kit,
      'save',
      "Save a project's tokens, kit files, and kit page as a kit the board's projects can add",
    )
      .argument('<project>', 'the project')
      .argument('<name>', 'the new kit'),
    context,
    async ([project = '', name = ''], options) => {
      const record = await saveKit(await boardOf(options, io), project, name)
      return {
        data: record,
        human: `Saved ${record.project} as the kit ${record.kit}`,
      }
    },
  )
}
