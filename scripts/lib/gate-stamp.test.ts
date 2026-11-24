import { execFileSync } from 'node:child_process'
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { afterEach, beforeEach, describe, expect, it } from 'vitest'

import { clearPass, gateKey, hasPassed, recordPass } from './gate-stamp.ts'
import { gitEnv } from './git.ts'

let root: string

function git(...args: string[]): string {
  return execFileSync('git', args, {
    cwd: root,
    encoding: 'utf8',
    env: gitEnv(),
  }).trim()
}

function write(name: string, text: string): void {
  writeFileSync(join(root, name), text)
}

function commit(message: string): void {
  git('add', '-A')
  git('-c', 'user.name=t', '-c', 'user.email=t@t', 'commit', '-qm', message)
}

beforeEach(() => {
  root = mkdtempSync(join(tmpdir(), 'gate-stamp-'))
  git('init', '-q', '-b', 'main')
  write('a.ts', 'one')
  commit('first')
})

afterEach(() => {
  rmSync(root, { recursive: true, force: true })
})

describe('gateKey', () => {
  it('should hold across committing the content it was read from', () => {
    write('a.ts', 'two')
    const before = gateKey(root, 'base')

    commit('second')

    expect(gateKey(root, 'base')).toBe(before)
  })

  it('should move on an unstaged edit', () => {
    const before = gateKey(root, 'base')

    write('a.ts', 'two')

    expect(gateKey(root, 'base')).not.toBe(before)
  })

  it('should move on an untracked file', () => {
    const before = gateKey(root, 'base')

    write('b.ts', 'new')

    expect(gateKey(root, 'base')).not.toBe(before)
  })

  it('should move on a new merge base', () => {
    expect(gateKey(root, 'other')).not.toBe(gateKey(root, 'base'))
  })

  it('should leave the index as it was', () => {
    write('b.ts', 'new')

    gateKey(root, 'base')

    expect(git('status', '--porcelain')).toBe('?? b.ts')
  })
})

describe('recordPass', () => {
  it('should remember the key it was given and no other', () => {
    recordPass(root, 'key')

    expect(hasPassed(root, 'key')).toBe(true)
    expect(hasPassed(root, 'other')).toBe(false)
  })

  it('should leave the tree clean', () => {
    recordPass(root, 'key')

    expect(git('status', '--porcelain')).toBe('')
  })
})

describe('clearPass', () => {
  it('should forget the last pass', () => {
    recordPass(root, 'key')

    clearPass(root)

    expect(hasPassed(root, 'key')).toBe(false)
  })
})
