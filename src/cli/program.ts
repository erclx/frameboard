import { fileURLToPath } from 'node:url'

import { Command, InvalidArgumentError } from 'commander'

import { resolveBoard } from '@/server/board/root'
import { version } from '@/shared/version'

import { registerCapture } from './commands/capture'
import { registerCheck } from './commands/check'
import { registerDocs } from './commands/docs'
import { registerEdit } from './commands/edit'
import { registerFrame } from './commands/frame'
import { registerInbox } from './commands/inbox'
import { registerInspect } from './commands/inspect'
import { registerList } from './commands/list'
import { registerNotes } from './commands/notes'
import { registerPage } from './commands/page'
import { registerProject } from './commands/project'
import { registerServe } from './commands/serve'
import { registerShow } from './commands/show'

// The bundle lands at dist/cli.js, so the built client sits beside it.
const CLIENT_DIR = fileURLToPath(new URL('./client', import.meta.url))
// The build copies the faces every frame imports beside the client.
const FACES_DIR = fileURLToPath(new URL('./faces', import.meta.url))

export interface CliIo {
  stdout: (text: string) => void
  stderr: (text: string) => void
  cwd: string
  /** Opens the board in the operator's browser. */
  openUrl: (url: string) => void
  /** Aborting stops a running `serve`, closing its server and removing its address file. */
  signal?: AbortSignal
}

/** The flags every verb takes, and `--project` where a project applies. */
export interface CommonOptions {
  json?: boolean
  root?: string
  project?: string
}

/** What a verb hands back: the result `--json` prints, and the line printed without it. */
export interface VerbResult {
  data: unknown
  human: string
}

export interface ProgramContext {
  io: CliIo
  /** Commander's own error text goes nowhere under `--json`, which prints one envelope instead. */
  json: boolean
  clientDir?: string
  facesDir?: string
}

export function parsePort(value: string): number {
  // Number() reads '' as 0 and accepts '1e3' or '0x10', so require plain digits.
  const port = /^\d+$/.test(value) ? Number(value) : Number.NaN
  if (!(port >= 0 && port <= 65535)) {
    throw new InvalidArgumentError('Expected a port between 0 and 65535.')
  }
  return port
}

/** An integer flag parser, refusing anything below `min`. */
export function parseInteger(min: number): (value: string) => number {
  return (value) => {
    const number = /^-?\d+$/.test(value) ? Number(value) : Number.NaN
    if (!Number.isSafeInteger(number) || number < min) {
      throw new InvalidArgumentError(
        min === Number.MIN_SAFE_INTEGER
          ? 'Expected an integer.'
          : `Expected an integer of at least ${min}.`,
      )
    }
    return number
  }
}

/** Adds a verb with `--json` and `--root`, and `--project` when it acts inside a project. */
export function addVerb(
  parent: Command,
  name: string,
  description: string,
  { project = false }: { project?: boolean } = {},
): Command {
  const command = parent
    .command(name)
    .description(description)
    .option('--json', 'print one JSON document on stdout')
    .option(
      '--root <path>',
      'the board folder, found from the working folder when absent',
    )
  if (project) {
    command.option(
      '--project <name>',
      "the project, defaulting to the board's only one",
    )
  }
  return command
}

/**
 * Runs a verb and prints its result: one `{ ok, data }` envelope under
 * `--json`, else its human line. A failure throws to `runCli`.
 */
export function act<O extends CommonOptions>(
  command: Command,
  { io }: ProgramContext,
  run: (args: string[], options: O, command: Command) => Promise<VerbResult>,
): Command {
  return command.action(async (...received: unknown[]) => {
    const self = received.at(-1) as Command
    const options = self.opts<O>()
    const { data, human } = await run(self.args, options, self)
    io.stdout(
      options.json
        ? `${JSON.stringify({ ok: true, data }, null, 2)}\n`
        : `${human}\n`,
    )
  })
}

export function boardOf(options: CommonOptions, io: CliIo): Promise<string> {
  return resolveBoard({ root: options.root, cwd: io.cwd })
}

export function createProgram(context: ProgramContext): Command {
  const { io, json } = context
  // Set ahead of the subcommands, which copy these settings when created.
  const program = new Command('frameboard')
    .version(version)
    .description(
      'A local design board that coding agents draw on as plain HTML files',
    )
    .exitOverride()
    // A group with flags of its own, as notes has, keeps them from its verbs
    // only when every parent stops reading flags at the verb's name.
    .enablePositionalOptions()
    .configureOutput({
      writeOut: io.stdout,
      writeErr: (text) => (json ? undefined : io.stderr(text)),
    })

  const facesDir = context.facesDir ?? FACES_DIR
  registerServe(program, {
    ...context,
    clientDir: context.clientDir ?? CLIENT_DIR,
    facesDir,
  })
  registerShow(program, context)
  registerList(program, context)
  registerProject(program, context)
  registerPage(program, context)
  registerFrame(program, { ...context, facesDir })
  registerEdit(program, context)
  registerCheck(program, context)
  registerNotes(program, context)
  registerInbox(program, context)
  registerCapture(program, { ...context, facesDir })
  registerInspect(program, { ...context, facesDir })
  registerDocs(program, context)

  return program
}
