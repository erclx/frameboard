import { type Command, CommanderError } from 'commander'

import { type ErrorCode, EXIT_CODES, FrameboardError } from '@/shared/errors'

import { type CliIo, createProgram } from './program'

/**
 * Runs one command line and returns its exit code. Under `--json` stdout
 * carries exactly one envelope, whether the command succeeded, failed, or
 * never parsed. Without it, a failure prints `frameboard: <message>` to
 * stderr, apart from commander's own parse errors, which it prints itself.
 */
export async function runCli(
  argv: string[],
  io: CliIo,
  { clientDir }: { clientDir?: string } = {},
): Promise<number> {
  const json = argv.includes('--json')
  const program = createProgram({ io, json, clientDir })
  try {
    await program.parseAsync(argv, { from: 'user' })
    return 0
  } catch (error) {
    if (error instanceof CommanderError && error.exitCode === 0) return 0
    const failure = toFailure(error, program, argv)
    if (json) {
      io.stdout(`${JSON.stringify({ ok: false, error: failure }, null, 2)}\n`)
    } else if (!(error instanceof CommanderError)) {
      io.stderr(`frameboard: ${failure.message}\n`)
    }
    return EXIT_CODES[failure.code]
  }
}

interface Failure {
  code: ErrorCode
  message: string
  details: Record<string, unknown>
}

function toFailure(error: unknown, program: Command, argv: string[]): Failure {
  if (error instanceof FrameboardError) {
    return { code: error.code, message: error.message, details: error.details }
  }
  if (error instanceof CommanderError) {
    const group = deepestCommand(program, argv)
    // A group takes no flags, so `frame --json` fails on the flag before the missing verb.
    if (
      group.commands.length > 0 &&
      ['commander.help', 'commander.unknownOption'].includes(error.code)
    ) {
      return missingCommand(group)
    }
    return {
      code: 'usage',
      message: error.message.replace(/^error: /, ''),
      details: { commander: error.code },
    }
  }
  return {
    code: 'internal',
    message: error instanceof Error ? error.message : String(error),
    details: {},
  }
}

/** The command the words of `argv` reach, stopping at the first that names none. */
function deepestCommand(program: Command, argv: string[]): Command {
  let command = program
  for (const word of argv.filter((arg) => !arg.startsWith('-'))) {
    const next = command.commands.find((child) => child.name() === word)
    if (!next) break
    command = next
  }
  return command
}

/**
 * Commander's error for a group run with no verb carries only its help text,
 * which `--json` silences, so name the verbs the group takes instead.
 */
function missingCommand(group: Command): Failure {
  const path = [group.name()]
  for (let parent = group.parent; parent; parent = parent.parent) {
    path.unshift(parent.name())
  }
  const commands = group.commands.map((command) => command.name())
  return {
    code: 'usage',
    message: `${path.join(' ')} needs a command, one of ${commands.join(', ')}.`,
    details: { commander: 'commander.help', commands },
  }
}
