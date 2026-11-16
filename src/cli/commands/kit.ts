import { basename, resolve } from 'node:path'

import type { Command } from 'commander'

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
  replace?: boolean
}

export function registerKit(program: Command, context: ProgramContext): void {
  const { io } = context
  const kit = program
    .command('kit')
    .description(
      "Install a design kit's tokens, styles, and sample frames into a project, or save a project's look as one",
    )

  act<CommonOptions>(
    addVerb(
      kit,
      'list',
      'List the kits a project can install, the shipped ones first and then the board’s own',
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
      'Install a kit into a project no token sheet reaches, refusing tokens-exist where a board, --tokens, or project sheet does unless --replace is given',
    )
      .argument('<project>', 'the project')
      .argument('[kit]', 'a kit `kit list` names')
      .option('--from <folder>', 'install the kit in this folder instead')
      .option(
        '--replace',
        "install over the project's own sheet, kit page, and kit files, or over a board sheet",
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
        replace: options.replace ?? false,
      })
      return {
        data: record,
        human: `Installed ${record.kit} into ${record.project}`,
      }
    },
  )

  act<CommonOptions>(
    addVerb(
      kit,
      'save',
      "Save a project's tokens, kit files, and kit page as a kit the board's projects can install",
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
