import { join } from 'node:path'
import { fileURLToPath } from 'node:url'

import { describe, expect, it } from 'vitest'

import { checkResultSchema } from '@/shared/records/check'

import { cli } from '../../../test/support/cli'

// `check` only reads, so the committed fixture serves every test as is.
const ROOT = fileURLToPath(
  new URL('../../../test/fixtures/boards/checks/', import.meta.url),
).replace(/\/$/, '')

function check(args: string[], cwd = ROOT) {
  return cli(['check', ...args, '--json'], { cwd })
}

describe('check', () => {
  it('returns the result in one envelope and exits 0 on a clean frame', async () => {
    const run = await check(['theme/pass'])

    expect(run.exitCode).toBe(0)
    expect(run.json()).toEqual({ ok: true, data: { checked: 1, findings: [] } })
  })

  it('fails check-findings, exit 8, with the result in the details', async () => {
    const run = await check(['theme/fail'])

    expect(run.exitCode).toBe(8)
    expect(run.json().error?.code).toBe('check-findings')
    expect(checkResultSchema.parse(run.json().error?.details)).toMatchObject({
      checked: 1,
      findings: [{ rule: 'theme', frame: 'rules/theme/fail' }],
    })
  })

  it('takes a project-qualified frame ref', async () => {
    const run = await check(['rules/theme/pass'])

    expect(run.json().data).toEqual({ checked: 1, findings: [] })
  })

  it('takes a path to the frame file against the working folder', async () => {
    const run = await check(['pass.html'], join(ROOT, 'rules/theme'))

    expect(run.json().data).toEqual({ checked: 1, findings: [] })
  })

  it('checks a whole page from a page ref', async () => {
    const run = await check(['network'])

    expect(run.json().error?.details).toMatchObject({
      checked: 2,
      findings: [{ rule: 'network' }],
    })
  })

  it('reads a two-part ref naming no frame as a project and page', async () => {
    const run = await check(['rules/network'])

    expect(run.json().error?.details).toMatchObject({ checked: 2 })
  })

  it('checks the whole project with no target', async () => {
    const run = await check([])

    expect(run.json().error?.details).toMatchObject({ checked: 22 })
  })

  it('fails frame-not-found, exit 3, on a ref that names nothing', async () => {
    const run = await check(['theme/nowhere'])

    expect(run.exitCode).toBe(3)
    expect(run.json().error?.code).toBe('frame-not-found')
  })

  it('prints each finding at its path, line, and column without --json', async () => {
    const run = await cli(['check', 'theme/fail'], { cwd: ROOT })

    expect(run.exitCode).toBe(8)
    expect(run.stderr).toContain('rules/theme/fail.html:9:9  theme  ')
  })
})
