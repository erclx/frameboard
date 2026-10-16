import type { Command } from 'commander'
import { z } from 'zod'

import { RULES } from '@/server/checks/run'
import { EXIT_CODES } from '@/shared/errors'
import { RECORDS } from '@/shared/records/index'
import { version } from '@/shared/version'

import { contentFormat } from '../docs/content-format'
import {
  act,
  addVerb,
  type CommonOptions,
  type ProgramContext,
} from '../program'

export interface VerbDoc {
  name: string
  description: string
  arguments: { name: string; required: boolean; description: string }[]
  options: {
    flags: string
    description: string
    required: boolean
    default?: unknown
    choices?: readonly string[]
  }[]
}

export function registerDocs(program: Command, context: ProgramContext): void {
  act<CommonOptions>(
    addVerb(
      program,
      'docs',
      'Print the verbs, exit codes, record shapes, content format, and check rules',
    ),
    context,
    async () => {
      const verbs = describeVerbs(program)
      return {
        data: {
          version,
          verbs,
          exitCodes: EXIT_CODES,
          records: Object.fromEntries(
            Object.entries(RECORDS).map(([name, schema]) => [
              name,
              z.toJSONSchema(schema, { io: 'input' }),
            ]),
          ),
          contentFormat: contentFormat(),
          checks: { rules: RULES },
        },
        human: verbs
          .map((verb) => `frameboard ${verb.name}  ${verb.description}`)
          .join('\n'),
      }
    },
  )
}

/** Every runnable verb under `program`, read off the commander tree the CLI parses with. */
export function describeVerbs(program: Command, prefix = ''): VerbDoc[] {
  return program.commands.flatMap((command) => {
    const name = `${prefix}${command.name()}`
    if (command.commands.length > 0) {
      return describeVerbs(command, `${name} `)
    }
    return [
      {
        name,
        description: command.description(),
        arguments: command.registeredArguments.map((argument) => ({
          name: argument.name(),
          required: argument.required,
          description: argument.description,
        })),
        options: command.options.map((option) => ({
          flags: option.flags,
          description: option.description,
          required: option.mandatory,
          ...(option.defaultValue === undefined
            ? {}
            : { default: option.defaultValue as unknown }),
          ...(option.argChoices ? { choices: option.argChoices } : {}),
        })),
      },
    ]
  })
}
