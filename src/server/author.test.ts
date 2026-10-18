import { execFileSync } from 'node:child_process'
import { mkdtempSync, realpathSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { afterEach, beforeEach, describe, expect, it } from 'vitest'

import { readAuthor } from './author'

describe('readAuthor', () => {
  let root: string
  /** Shuts out the machine's global and system git config, so only the board's repository speaks. */
  let env: NodeJS.ProcessEnv

  beforeEach(() => {
    root = realpathSync(mkdtempSync(join(tmpdir(), 'frameboard-author-')))
    env = {
      ...process.env,
      GIT_CONFIG_GLOBAL: join(root, 'no-global'),
      GIT_CONFIG_NOSYSTEM: '1',
    }
    execFileSync('git', ['init', '--quiet'], { cwd: root, env })
  })

  afterEach(() => {
    rmSync(root, { recursive: true, force: true })
  })

  it("reads the board repository's user.name", async () => {
    execFileSync('git', ['config', 'user.name', 'Ada Lovelace'], {
      cwd: root,
      env,
    })

    expect(await readAuthor(root, env)).toBe('Ada Lovelace')
  })

  it('answers null when user.name is unset', async () => {
    expect(await readAuthor(root, env)).toBeNull()
  })

  it('answers null when git is not on the PATH', async () => {
    expect(await readAuthor(root, { ...env, PATH: '' })).toBeNull()
  })
})
