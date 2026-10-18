import { execFile } from 'node:child_process'
import { promisify } from 'node:util'

const run = promisify(execFile)

/**
 * The name notes are signed with, being git's `user.name` as read from the
 * board folder, so a repository's own setting wins over the global one. Null
 * when git is missing, the setting is unset, or it reads empty.
 */
export async function readAuthor(
  root: string,
  env: NodeJS.ProcessEnv = process.env,
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
