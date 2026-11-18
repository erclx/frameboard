import { type ChildProcess, spawn } from 'node:child_process'
import { open } from 'node:fs/promises'
import { join } from 'node:path'

import { FrameboardError } from '@/shared/errors'

import { ensureRunFolder } from '../address'

/** The `serve` environment variable holding the command a dispatched note runs. */
export const DISPATCH_ENV = 'FRAMEBOARD_DISPATCH'

const DISPATCH_LOG = 'dispatch.log'

/**
 * How long a command has to fail before it counts as started, well past the
 * 700 ms `claude --bg` takes to refuse an untrusted folder.
 */
const START_WINDOW_MS = 2000

/** A note handed to a session the dispatch starts. */
export interface DispatchedNote {
  /** The session id Frameboard minted for the started session. */
  session: string
  id: string
  /** The line a follower would print for the note. */
  line: string
}

export type Dispatch = (note: DispatchedNote) => Promise<void>

export interface DispatcherOptions {
  /** The developer's command, run through `sh -c`. */
  command: string
  /** The folder `serve` ran in, which the command runs in. */
  cwd: string
  root: string
  /** The environment the command inherits, beside the note's own variables. */
  env: NodeJS.ProcessEnv
  windowMs?: number
}

/**
 * Starts a session for a note by running the developer's command detached, the
 * note reaching it as environment variables alone, so its text is data to the shell.
 */
export function createDispatcher({
  command,
  cwd,
  root,
  env,
  windowMs = START_WINDOW_MS,
}: DispatcherOptions): Dispatch {
  return async ({ session, id, line }) => {
    const log = await open(join(await ensureRunFolder(root), DISPATCH_LOG), 'a')
    try {
      const child = spawn('sh', ['-c', command], {
        cwd,
        detached: true,
        stdio: ['ignore', log.fd, log.fd],
        env: {
          ...env,
          FRAMEBOARD_SESSION: session,
          FRAMEBOARD_NOTE: line,
          FRAMEBOARD_NOTE_ID: id,
          FRAMEBOARD_ROOT: root,
        },
      })
      await started(child, windowMs)
    } finally {
      // The child holds its own copy of the descriptor.
      await log.close()
    }
  }
}

function started(child: ChildProcess, windowMs: number): Promise<void> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      // The server's exit never waits on a session it started.
      child.unref()
      resolve()
    }, windowMs)
    child.once('error', (error) => {
      clearTimeout(timer)
      reject(
        new FrameboardError(
          'dispatch-failed',
          `The ${DISPATCH_ENV} command did not start: ${error.message}`,
          {},
          { cause: error },
        ),
      )
    })
    child.once('exit', (code, signal) => {
      clearTimeout(timer)
      if (code === 0) {
        resolve()
        return
      }
      reject(
        new FrameboardError(
          'dispatch-failed',
          `The ${DISPATCH_ENV} command exited ${code ?? signal} within ${windowMs} ms. Its output is in .run/${DISPATCH_LOG}.`,
          { code, signal },
        ),
      )
    })
  })
}
