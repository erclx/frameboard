import { execFileSync } from 'node:child_process'

/**
 * The environment with no `GIT_*` variable, since a hook exports `GIT_DIR` and
 * would point a command at the checkout being pushed rather than its `cwd`.
 */
export function gitEnv(
  env: NodeJS.ProcessEnv = process.env,
): NodeJS.ProcessEnv {
  return Object.fromEntries(
    Object.entries(env).filter(([key]) => !key.startsWith('GIT_')),
  )
}

/** What a git command run in `cwd` prints, throwing on a non-zero exit. */
export function git(
  cwd: string,
  args: readonly string[],
  extra: Record<string, string> = {},
): string {
  return execFileSync('git', args, {
    cwd,
    encoding: 'utf8',
    env: { ...gitEnv(), ...extra },
    stdio: ['ignore', 'pipe', 'pipe'],
    maxBuffer: 64 * 1024 * 1024,
  })
}
