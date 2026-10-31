import { execFile } from 'node:child_process'
import { existsSync } from 'node:fs'
import { release } from 'node:os'
import { delimiter, join } from 'node:path'
import { promisify } from 'node:util'

import { FrameboardError } from '@/shared/errors'

import { wslClipboard } from './wsl'

/** The OS clipboard backends the server can put files on. */
export type ClipboardBackend = 'wsl'

/** One rendered image, named as it lands on the clipboard. */
export interface ClipboardFile {
  name: string
  bytes: Buffer
}

/** Puts files on the OS clipboard as a file list, so one paste lands them all. */
export interface ClipboardFiles {
  backend: ClipboardBackend
  write: (files: ClipboardFile[]) => Promise<void>
}

/** Runs a command and resolves its standard output. */
export type RunCommand = (command: string, args: string[]) => Promise<string>

/** What the backend is picked from, read off the running process by default. */
export interface ClipboardHost {
  platform: NodeJS.Platform
  release: string
  env: NodeJS.ProcessEnv
  run: RunCommand
  /** True when a command resolves on `PATH`. */
  onPath: (command: string) => boolean
}

/**
 * The backend this machine has, or null where none applies, so a caller
 * reports it before any copy is asked for. WSL needs `powershell.exe` on its
 * `PATH`, since interop can be turned off.
 */
export function clipboardFiles(
  host: ClipboardHost = processHost(),
): ClipboardFiles | null {
  if (isWsl(host) && host.onPath('powershell.exe'))
    return wslClipboard(host.run)
  return null
}

/** The refusal for a copy where `clipboardFiles` found no backend. */
export function clipboardUnsupported(): FrameboardError {
  return new FrameboardError(
    'clipboard-unsupported',
    'This system has no clipboard backend for a file list. Only Windows under WSL has one.',
  )
}

// A WSL kernel names Microsoft in its release, and a WSL shell sets the distro name.
function isWsl({ platform, release, env }: ClipboardHost): boolean {
  if (platform !== 'linux') return false
  return Boolean(env.WSL_DISTRO_NAME) || /microsoft/i.test(release)
}

function processHost(): ClipboardHost {
  const run = promisify(execFile)
  return {
    platform: process.platform,
    release: release(),
    env: process.env,
    run: async (command, args) => (await run(command, args)).stdout,
    onPath: (command) =>
      (process.env.PATH ?? '')
        .split(delimiter)
        .some((dir) => dir !== '' && existsSync(join(dir, command))),
  }
}
