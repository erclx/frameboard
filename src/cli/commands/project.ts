import { Command, Option } from 'commander'

import {
  addProject,
  deleteProject,
  fileProjects,
  renameProject,
} from '@/server/board/projects'
import { writeStarterSheet } from '@/server/look/starter'
import { FrameboardError } from '@/shared/errors'
import {
  DEFAULT_LOOK,
  STARTER_ACCENTS,
  STARTER_FONTS,
  type StarterLook,
} from '@/shared/starter-tokens'

import {
  act,
  addVerb,
  boardOf,
  type CommonOptions,
  type ProgramContext,
} from '../program'

export function registerProject(
  program: Command,
  context: ProgramContext,
): void {
  const { io } = context
  const project = program.command('project').description('Manage projects')

  act<CommonOptions>(
    addVerb(project, 'add', 'Add a project holding one empty page').argument(
      '<name>',
      'the new project',
    ),
    context,
    async ([name = ''], options) => {
      const record = await addProject(await boardOf(options, io), name)
      return { data: record, human: `Added project ${record.name}` }
    },
  )

  act<CommonOptions>(
    addVerb(project, 'rename', 'Rename a project')
      .argument('<name>', 'the project')
      .argument('<new-name>', 'its new name'),
    context,
    async ([name = '', newName = ''], options) => {
      const record = await renameProject(
        await boardOf(options, io),
        name,
        newName,
      )
      return {
        data: record,
        human: `Renamed project ${name} to ${record.name}`,
      }
    },
  )

  act<CommonOptions>(
    addVerb(
      project,
      'delete',
      'Delete a project and everything in it',
    ).argument('<name>', 'the project'),
    context,
    async ([name = ''], options) => {
      const result = await deleteProject(await boardOf(options, io), name)
      return { data: result, human: `Deleted project ${result.deleted}` }
    },
  )

  act<CommonOptions & { clear?: boolean }>(
    addVerb(
      project,
      'group',
      'File a project under a home folder, or take it out of one with --clear',
    )
      .argument('<name>', 'the project')
      .argument('[folder]', 'the home folder, created when no project holds it')
      .option('--clear', 'take the project out of its folder'),
    context,
    async ([name = '', folder], options) => {
      const group = folderOf(folder, options.clear === true)
      const [record] = await fileProjects(await boardOf(options, io), [name], {
        group,
      })
      if (!record) throw new FrameboardError('internal', 'No project filed.')
      return {
        data: record,
        human: group
          ? `Filed project ${record.name} under ${group}`
          : `Took project ${record.name} out of its folder`,
      }
    },
  )

  act<CommonOptions & StarterLook>(
    addVerb(
      project,
      'tokens',
      'Write a starter tokens.css into a project no token sheet reaches, refusing tokens-exist where a board, --tokens, or project sheet does',
    )
      .argument('<name>', 'the project')
      .addOption(
        new Option('--accent <preset>', 'the accent, light and dark')
          .choices(Object.keys(STARTER_ACCENTS))
          .default(DEFAULT_LOOK.accent),
      )
      .addOption(
        new Option('--font <face>', 'the text face')
          .choices(Object.keys(STARTER_FONTS))
          .default(DEFAULT_LOOK.font),
      ),
    context,
    async ([name = ''], options) => {
      const record = await writeStarterSheet(await boardOf(options, io), name, {
        accent: options.accent,
        font: options.font,
      })
      return {
        data: record,
        human: `Wrote ${record.path} with the ${record.accent} accent`,
      }
    },
  )
}

/**
 * The folder a `group` call names, or null for `--clear`. A blank folder is
 * refused here, since the writer reads one as a clear.
 */
function folderOf(folder: string | undefined, clear: boolean): string | null {
  if (clear && folder !== undefined) {
    throw new FrameboardError('usage', 'Give a folder or --clear, not both.')
  }
  if (clear) return null
  if (folder === undefined) {
    throw new FrameboardError(
      'usage',
      'Give a folder, or --clear to leave one.',
    )
  }
  const name = folder.trim()
  if (name === '' || name.length > MAX_FOLDER) {
    throw new FrameboardError(
      'invalid-name',
      `A folder name holds 1 to ${MAX_FOLDER} characters.`,
    )
  }
  return name
}

/** The longest folder name the board's own filing route accepts. */
const MAX_FOLDER = 256
