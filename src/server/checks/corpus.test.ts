import { existsSync } from 'node:fs'

import { describe, expect, it } from 'vitest'

import { listProjects } from '@/server/board/scan'

import { checkProject } from './run'

// The groundwork corpus stays private, so this suite runs only where
// FRAMEBOARD_CORPUS names a local board holding it: the compass and canon
// canvases and the four spike frames, one project each.
const corpus = process.env.FRAMEBOARD_CORPUS

describe.skipIf(!corpus || !existsSync(corpus))('the local corpus', () => {
  it('reproduces the frame counts the groundwork track measured', async () => {
    const root = corpus ?? ''
    const flagged = new Map<string, Set<string>>()
    for (const project of await listProjects(root)) {
      for (const finding of (await checkProject(root, project)).findings) {
        const rule = /-font$/.test(finding.rule) ? 'fonts' : finding.rule
        const frames = flagged.get(rule) ?? new Set()
        frames.add(finding.frame ?? finding.path)
        flagged.set(rule, frames)
      }
    }

    expect(
      Object.fromEntries(
        [...flagged].map(([rule, frames]) => [rule, frames.size]),
      ),
    ).toEqual({
      'outside-link': 99,
      fonts: 10,
      theme: 7,
      'table-tbody': 1,
      'missing-file': 2,
    })
  })
})
