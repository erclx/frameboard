import { CommanderError } from 'commander'

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
    const failure = toFailure(error)
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

function toFailure(error: unknown): Failure {
  if (error instanceof FrameboardError) {
    return { code: error.code, message: error.message, details: error.details }
  }
  if (error instanceof CommanderError) {
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
