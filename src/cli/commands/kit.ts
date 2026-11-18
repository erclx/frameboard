import { basename, resolve } from 'node:path'

import { type Command, Option } from 'commander'

import { installKit } from '@/server/kits/install'
import { findKit, listKits } from '@/server/kits/list'
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
      'Add a kit to a project as a copy under assets/kits/<kit>/, leaving its token sheets alone, so frame kit can set it on a frame. Refuses name-taken where the project already holds a kit by that name',
    )
      .argument('<project>', 'the project')
      .argument('[kit]', 'a kit `kit list` names')
      .option('--from <folder>', 'add the kit in this folder instead')
      // Accepted and ignored, since a script written for the install that replaced a look may still pass it.
      .addOption(new Option('--replace').hideHelp()),
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
      const record = await installKit(root, project, found)
      return {
        data: record,
        human: `Added ${record.kit} to ${record.project}`,
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
