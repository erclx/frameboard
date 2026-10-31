import { execFile } from 'node:child_process'
import { randomBytes } from 'node:crypto'
import { mkdir, readFile, rename, rm, writeFile } from 'node:fs/promises'
import { homedir } from 'node:os'
import { join } from 'node:path'
import { promisify } from 'node:util'

import { FrameboardError } from '@/shared/errors'

const run = promisify(execFile)

/** The longest name a note is signed with. */
const MAX_NAME = 80

/** Where a signing name comes from, the machine's saved name winning over git's. */
export type AuthorSource = 'config' | 'git'

export interface Author {
  /** The name notes are signed with, null when neither source has one. */
  name: string | null
  /** Which source answered, null when neither did. */
  source: AuthorSource | null
}

/**
 * The name notes are signed with. The name saved on this machine wins, then
 * git's `user.name` as read from the board folder, so a repository's own
 * setting wins over the global one. Null when neither has one.
 */
export async function readAuthor(
  root: string,
  env: NodeJS.ProcessEnv = process.env,
): Promise<Author> {
  const saved = (await readConfig(env)).name
  if (typeof saved === 'string' && saved.trim() !== '') {
    return { name: saved.trim(), source: 'config' }
  }
  const git = await readGitName(root, env)
  return git === null
    ? { name: null, source: null }
    : { name: git, source: 'git' }
}

/**
 * Saves the name notes are signed with on this machine, outside every board,
 * and clears it on an empty string so git's name answers again. Keeps every
 * other key in the config file, and replaces one that fails to parse.
 */
export async function writeAuthorName(
  name: string,
  env: NodeJS.ProcessEnv = process.env,
): Promise<void> {
  const trimmed = name.trim()
  if (trimmed.length > MAX_NAME || /[\r\n]/.test(trimmed)) {
    throw new FrameboardError(
      'invalid-name',
      `A name is one line of at most ${MAX_NAME} characters.`,
    )
  }
  const config = await readConfig(env)
  if (trimmed === '') delete config.name
  else config.name = trimmed
  await writeConfig(env, config)
}

/** `$XDG_CONFIG_HOME/frameboard`, else `~/.config/frameboard`, on macOS and Linux alike. */
function configDir(env: NodeJS.ProcessEnv): string {
  const base = env.XDG_CONFIG_HOME?.startsWith('/')
    ? env.XDG_CONFIG_HOME
    : join(env.HOME || homedir(), '.config')
  return join(base, 'frameboard')
}

/** The config file's keys, empty when it is missing or fails to parse as an object. */
async function readConfig(
  env: NodeJS.ProcessEnv,
): Promise<Record<string, unknown>> {
  try {
    const parsed: unknown = JSON.parse(
      await readFile(join(configDir(env), 'config.json'), 'utf8'),
    )
    return typeof parsed === 'object' &&
      parsed !== null &&
      !Array.isArray(parsed)
      ? (parsed as Record<string, unknown>)
      : {}
  } catch {
    return {}
  }
}

/** Lands the whole file through a rename, so a crash never leaves half of one. */
async function writeConfig(
  env: NodeJS.ProcessEnv,
  config: Record<string, unknown>,
): Promise<void> {
  const dir = configDir(env)
  await mkdir(dir, { recursive: true })
  const temporary = join(
    dir,
    `.config.json.${randomBytes(6).toString('hex')}.tmp`,
  )
  try {
    await writeFile(temporary, `${JSON.stringify(config, null, 2)}\n`)
    await rename(temporary, join(dir, 'config.json'))
  } catch (error) {
    await rm(temporary, { force: true })
    throw error
  }
}

async function readGitName(
  root: string,
  env: NodeJS.ProcessEnv,
): Promise<string | null> {
  try {
    const { stdout } = await run('git', ['config', 'user.name'], {
      cwd: root,
      env,
    })
    return stdout.trim() || null
  } catch {
    // git exits 1 for an unset key, and a missing binary rejects with ENOENT.
    return null
  }
}
