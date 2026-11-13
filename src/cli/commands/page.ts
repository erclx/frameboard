import { Argument, type Command } from 'commander'

import {
  addPage,
  deletePage,
  duplicatePage,
  movePage,
  renamePage,
  setPageTransition,
} from '@/server/board/pages'
import {
  TRANSITION_LABELS,
  transitionNameOf,
  TRANSITIONS,
} from '@/shared/present-transition'

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
  withTransitionFlags,
} from './transition-flags'

const PAGE_REF = 'a page ref, <page> or <project>/<page>'
const INDEX = 'position in the page order, 0 first, clamped'

export function registerPage(program: Command, context: ProgramContext): void {
  const { io } = context
  const page = program.command('page').description('Manage pages')
  const verb = (name: string, description: string) =>
    addVerb(page, name, description, { project: true }).argument(
      '<page-ref>',
      PAGE_REF,
    )

  act<CommonOptions & { index?: number }>(
    verb('add', 'Add an empty page').option(
      '--index <n>',
      INDEX,
      parseInteger(0),
    ),
    context,
    async ([ref = ''], options) => {
      const record = await addPage(await boardOf(options, io), ref, {
        ...options,
        cwd: io.cwd,
      })
      return { data: record, human: `Added page ${record.ref}` }
    },
  )

  act<CommonOptions & { name?: string }>(
    verb('duplicate', 'Copy a page and its frames, leaving its notes').option(
      '--name <new>',
      'name of the copy, defaulting to the next free -2, -3',
    ),
    context,
    async ([ref = ''], options) => {
      const record = await duplicatePage(await boardOf(options, io), ref, {
        ...options,
        cwd: io.cwd,
      })
      return { data: record, human: `Duplicated ${ref} as ${record.ref}` }
    },
  )

  act<CommonOptions>(
    verb('rename', 'Rename a page').argument('<new-name>', 'its new name'),
    context,
    async ([ref = '', newName = ''], options) => {
      const record = await renamePage(
        await boardOf(options, io),
        ref,
        newName,
        {
          ...options,
          cwd: io.cwd,
        },
      )
      return { data: record, human: `Renamed ${ref} to ${record.ref}` }
    },
  )

  act<CommonOptions & { index: number }>(
    verb('move', 'Move a page in the page order').requiredOption(
      '--index <n>',
      INDEX,
      parseInteger(0),
    ),
    context,
    async ([ref = ''], options) => {
      const record = await movePage(await boardOf(options, io), ref, {
        ...options,
        cwd: io.cwd,
      })
      return { data: record, human: `Moved ${record.ref} to ${record.index}` }
    },
  )

  act<CommonOptions & TransitionFlags>(
    withTransitionFlags(
      verb(
        'transition',
        'Set the transition present mode draws between the page’s slides, or clear it with none so they cut, writing only layout.json',
      ).addArgument(
        new Argument(
          '<transition>',
          'the transition, none to clear it',
        ).choices(TRANSITIONS),
      ),
    ),
    context,
    async ([ref = '', name = ''], options) => {
      const chosen = transitionNameOf(name) ?? 'none'
      const record = await setPageTransition(
        await boardOf(options, io),
        ref,
        chosen === 'none' ? null : transitionFrom(chosen, options),
        { ...options, cwd: io.cwd },
      )
      return {
        data: record,
        human: record.transition
          ? `Set ${TRANSITION_LABELS[record.transition.name]} on ${record.ref}`
          : `Cleared the transition on ${record.ref}`,
      }
    },
  )

  act<CommonOptions>(
    verb('delete', 'Delete a page and its frames'),
    context,
    async ([ref = ''], options) => {
      const result = await deletePage(await boardOf(options, io), ref, {
        ...options,
        cwd: io.cwd,
      })
      return { data: result, human: `Deleted page ${result.deleted}` }
    },
  )
}
