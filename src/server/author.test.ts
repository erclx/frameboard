import { execFileSync } from 'node:child_process'
import {
  mkdirSync,
  mkdtempSync,
  readFileSync,
  realpathSync,
  rmSync,
  writeFileSync,
} from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { afterEach, beforeEach, describe, expect, it } from 'vitest'

import { readAuthor, writeAuthorName } from './author'

describe('author', () => {
  let root: string
  let configFile: string
  /**
   * Shuts out the machine's global and system git config, so only the
   * board's repository speaks, and points the config folder into the
   * temporary root, so no test reads or writes the developer's own name. It
   * drops every inherited `GIT_` variable too, since a git hook running this
   * suite exports `GIT_DIR`, which would point `git init` and `git config`
   * here at the repository running the hook.
   */
  let env: NodeJS.ProcessEnv

  beforeEach(() => {
    root = realpathSync(mkdtempSync(join(tmpdir(), 'frameboard-author-')))
    env = {
      ...Object.fromEntries(
        Object.entries(process.env).filter(([key]) => !key.startsWith('GIT_')),
      ),
      GIT_CONFIG_GLOBAL: join(root, 'no-global'),
      GIT_CONFIG_NOSYSTEM: '1',
      XDG_CONFIG_HOME: join(root, 'config'),
    }
    configFile = join(root, 'config', 'frameboard', 'config.json')
    execFileSync('git', ['init', '--quiet'], { cwd: root, env })
  })

  afterEach(() => {
    rmSync(root, { recursive: true, force: true })
  })

  function setGitName(name: string): void {
    execFileSync('git', ['config', 'user.name', name], { cwd: root, env })
  }

  function writeConfigFile(text: string): void {
    mkdirSync(join(root, 'config', 'frameboard'), { recursive: true })
    writeFileSync(configFile, text)
  }

  describe('readAuthor', () => {
    it("reads the board repository's user.name with no saved name", async () => {
      setGitName('Ada Lovelace')

      expect(await readAuthor(root, env)).toEqual({
        name: 'Ada Lovelace',
        source: 'git',
      })
    })

    it('answers the saved name over git', async () => {
      setGitName('Ada Lovelace')
      writeConfigFile('{ "name": "Grace Hopper" }')

      expect(await readAuthor(root, env)).toEqual({
        name: 'Grace Hopper',
        source: 'config',
      })
    })

    it('answers null when neither source has a name', async () => {
      expect(await readAuthor(root, env)).toEqual({ name: null, source: null })
    })

    it('answers null when git is not on the PATH', async () => {
      expect(await readAuthor(root, { ...env, PATH: '' })).toEqual({
        name: null,
        source: null,
      })
    })

    it('falls back to git when the config file fails to parse', async () => {
      setGitName('Ada Lovelace')
      writeConfigFile('{ not json')

      expect(await readAuthor(root, env)).toEqual({
        name: 'Ada Lovelace',
        source: 'git',
      })
    })

    it('reads ~/.config when XDG_CONFIG_HOME is unset', async () => {
      const home = { ...env, XDG_CONFIG_HOME: undefined, HOME: root }
      mkdirSync(join(root, '.config', 'frameboard'), { recursive: true })
      writeFileSync(
        join(root, '.config', 'frameboard', 'config.json'),
        '{ "name": "Grace Hopper" }',
      )

      expect(await readAuthor(root, home)).toEqual({
        name: 'Grace Hopper',
        source: 'config',
      })
    })
  })

  describe('writeAuthorName', () => {
    it('saves a trimmed name that the next read answers', async () => {
      await writeAuthorName('  Grace Hopper  ', env)

      expect(await readAuthor(root, env)).toEqual({
        name: 'Grace Hopper',
        source: 'config',
      })
    })

    it('keeps a key it does not own', async () => {
      writeConfigFile('{ "theme": "dark", "name": "Old" }')

      await writeAuthorName('Grace Hopper', env)

      expect(JSON.parse(readFileSync(configFile, 'utf8'))).toEqual({
        theme: 'dark',
        name: 'Grace Hopper',
      })
    })

    it('replaces a file that fails to parse', async () => {
      writeConfigFile('{ not json')

      await writeAuthorName('Grace Hopper', env)

      expect(JSON.parse(readFileSync(configFile, 'utf8'))).toEqual({
        name: 'Grace Hopper',
      })
    })

    it('clears the saved name on an empty string, so git answers again', async () => {
      setGitName('Ada Lovelace')
      writeConfigFile('{ "theme": "dark", "name": "Grace Hopper" }')

      await writeAuthorName('', env)

      expect(await readAuthor(root, env)).toEqual({
        name: 'Ada Lovelace',
        source: 'git',
      })
      expect(JSON.parse(readFileSync(configFile, 'utf8'))).toEqual({
        theme: 'dark',
      })
    })

    it('refuses a name over 80 characters', async () => {
      await expect(writeAuthorName('a'.repeat(81), env)).rejects.toMatchObject({
        code: 'invalid-name',
      })
    })

    it('refuses a name holding a line break', async () => {
      await expect(writeAuthorName('Grace\nHopper', env)).rejects.toMatchObject(
        { code: 'invalid-name' },
      )
    })
  })
})
