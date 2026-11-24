import {
  copyFileSync,
  existsSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'

import { git } from './git.ts'

function gitPath(root: string, name: string): string {
  return resolve(root, git(root, ['rev-parse', '--git-path', name]).trimEnd())
}

/**
 * Names the content the gate reads, being every file git would track and the
 * merge base its changed set is measured from. It holds across a commit of
 * that content, so a push after the commit matches the run before it.
 */
export function gateKey(root: string, base: string): string {
  const scratch = mkdtempSync(join(tmpdir(), 'gate-index-'))
  try {
    const index = join(scratch, 'index')
    const real = gitPath(root, 'index')
    if (existsSync(real)) copyFileSync(real, index)
    git(root, ['add', '-A'], { GIT_INDEX_FILE: index })
    const tree = git(root, ['write-tree'], { GIT_INDEX_FILE: index })
    return `${base} ${tree.trim()}`
  } finally {
    rmSync(scratch, { recursive: true, force: true })
  }
}

// In the git directory, so each worktree keeps its own and none is tracked.
function stampPath(root: string): string {
  return gitPath(root, 'frameboard-gate')
}

export function hasPassed(root: string, key: string): boolean {
  const stamp = stampPath(root)
  return existsSync(stamp) && readFileSync(stamp, 'utf8') === key
}

export function recordPass(root: string, key: string): void {
  writeFileSync(stampPath(root), key)
}

export function clearPass(root: string): void {
  rmSync(stampPath(root), { force: true })
}
