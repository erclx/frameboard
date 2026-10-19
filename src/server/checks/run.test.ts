import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'

import { afterEach, beforeEach, describe, expect, it } from 'vitest'

import { checkFrame, readProjectContext } from './frame'
import { checkPage, checkProject, RULES } from './run'

// The checks only read, so the committed fixture serves every test as is.
const ROOT = fileURLToPath(
  new URL('../../../test/fixtures/boards/checks/', import.meta.url),
).replace(/\/$/, '')

/** Each fail frame on the fixture board, and the one rule its page is named for. */
const FAILING: [string, string][] = [
  ['rules/naming/Bad Name', 'naming'],
  ['rules/head-body/fail', 'head-body'],
  ['rules/table-tbody/fail', 'table-tbody'],
  ['rules/outside-link/fail', 'outside-link'],
  ['rules/network/fail', 'network'],
  ['rules/missing-file/fail', 'missing-file'],
  ['rules/default-font/fail', 'default-font'],
  ['rules/generic-font/fail', 'generic-font'],
  ['rules/theme/fail', 'theme'],
  ['rules/allowed-fonts/fail', 'allowed-fonts'],
  ['rules/uppercase/fail', 'uppercase'],
]

describe('checkProject', () => {
  it('checks every frame on every page', async () => {
    const { checked } = await checkProject(ROOT, 'rules')

    expect(checked).toBe(22)
  })

  it('reports each fail frame for its own rule and nothing else', async () => {
    const { findings } = await checkProject(ROOT, 'rules')
    const byFrame = new Map<string, string[]>()
    for (const finding of findings) {
      if (finding.frame === null) continue
      byFrame.set(finding.frame, [
        ...(byFrame.get(finding.frame) ?? []),
        finding.rule,
      ])
    }

    expect(Object.fromEntries(byFrame)).toEqual(
      Object.fromEntries(FAILING.map(([ref, rule]) => [ref, [rule]])),
    )
  })

  it('reports the dot-named folder against the project', async () => {
    const { findings } = await checkProject(ROOT, 'rules')

    expect(findings.filter((finding) => finding.frame === null)).toMatchObject([
      { rule: 'dot-folder', path: 'rules/.drafts' },
    ])
  })
})

describe('checkPage', () => {
  it('checks the frames of one page alone', async () => {
    const result = await checkPage(ROOT, 'rules', 'theme')

    expect(result).toMatchObject({
      checked: 2,
      findings: [{ rule: 'theme', frame: 'rules/theme/fail' }],
    })
  })
})

describe('checkFrame', () => {
  it('reads the project config, so allowed fonts apply to one frame', () => {
    const result = checkFrame({
      root: ROOT,
      project: 'rules',
      page: 'allowed-fonts',
      name: 'fail',
    })

    expect(result).toMatchObject({
      checked: 1,
      findings: [{ rule: 'allowed-fonts' }],
    })
  })

  it('passes a frame whose family comes from the board token sheet', () => {
    expect(
      checkFrame({ root: ROOT, project: 'rules', page: 'theme', name: 'pass' }),
    ).toEqual({ checked: 1, findings: [] })
  })
})

describe('readProjectContext', () => {
  let root: string

  beforeEach(() => {
    root = mkdtempSync(join(tmpdir(), 'frameboard-context-'))
    mkdirSync(join(root, 'app'))
  })

  afterEach(() => {
    rmSync(root, { recursive: true, force: true })
  })

  function writeChecks(checks: unknown): void {
    writeFileSync(
      join(root, 'app', 'project.json'),
      JSON.stringify({ version: 1, pages: [], checks }),
    )
  }

  it('reads a positive minimum font size', () => {
    writeChecks({ minFontSize: 12 })

    expect(readProjectContext(root, 'app').config).toEqual({ minFontSize: 12 })
  })

  it.each([
    ['zero', 0],
    ['a string', '12'],
  ])('leaves the minimum font size off for %s', (_, minFontSize) => {
    writeChecks({ minFontSize })

    expect(readProjectContext(root, 'app').config).toEqual({})
  })
})

describe('RULES', () => {
  it('lists every rule id the fixture board trips, once', () => {
    const ids = RULES.map((rule) => rule.id)

    expect(new Set(ids).size).toBe(ids.length)
    expect(ids).toEqual(
      expect.arrayContaining([
        ...FAILING.map(([, rule]) => rule),
        'dot-folder',
      ]),
    )
  })
})
