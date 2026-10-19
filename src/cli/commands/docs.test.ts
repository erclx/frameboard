import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { afterEach, beforeEach, describe, expect, it } from 'vitest'

import { EXIT_CODES } from '@/shared/errors'
import { RECORDS } from '@/shared/records/index'

import { cli } from '../../../test/support/cli'

describe('docs', () => {
  let cwd: string

  beforeEach(() => {
    cwd = mkdtempSync(join(tmpdir(), 'frameboard-docs-'))
  })

  afterEach(() => {
    rmSync(cwd, { recursive: true, force: true })
  })

  async function docs() {
    const run = await cli(['docs', '--json'], { cwd })
    return run.json().data as {
      verbs: { name: string; options: { flags: string; default?: unknown }[] }[]
      exitCodes: unknown
      records: Record<string, { type?: string }>
      contentFormat: { names: { pattern: string } }
      checks: { rules: { id: string; tier: string; configKey?: string }[] }
    }
  }

  it('runs outside any board', async () => {
    const run = await cli(['docs', '--json'], { cwd })

    expect(run.exitCode).toBe(0)
  })

  it('lists every registered verb', async () => {
    const { verbs } = await docs()

    expect(verbs.map((verb) => verb.name)).toEqual([
      'serve',
      'show',
      'selection',
      'list',
      'project add',
      'project rename',
      'project delete',
      'page add',
      'page duplicate',
      'page rename',
      'page move',
      'page delete',
      'frame add',
      'frame duplicate',
      'frame move',
      'frame resize',
      'frame fit',
      'frame order',
      'frame rename',
      'frame delete',
      'frame hide',
      'frame lock',
      'edit',
      'check',
      'notes',
      'notes reply',
      'notes done',
      'inbox',
      'capture',
      'inspect',
      'docs',
    ])
  })

  it('lists each option with its default', async () => {
    const { verbs } = await docs()

    expect(verbs.find((verb) => verb.name === 'serve')?.options).toContainEqual(
      expect.objectContaining({ flags: '-p, --port <port>', default: 4173 }),
    )
  })

  it('prints a JSON schema for every registered record', async () => {
    const { records } = await docs()

    expect(Object.keys(records)).toEqual(Object.keys(RECORDS))
    expect(records.layout?.type).toBe('object')
  })

  it('prints the exit table and the name rule from their sources', async () => {
    const { exitCodes, contentFormat } = await docs()

    expect(exitCodes).toEqual(EXIT_CODES)
    expect(contentFormat.names.pattern).toBe('^[A-Za-z0-9][A-Za-z0-9._-]*$')
  })

  it('lists every check rule with its tier and the config key that turns it on', async () => {
    const { checks } = await docs()

    expect(checks.rules).toContainEqual(
      expect.objectContaining({ id: 'theme', tier: 'selector' }),
    )
    expect(checks.rules).toContainEqual(
      expect.objectContaining({ id: 'uppercase', configKey: 'noUppercase' }),
    )
  })

  it('lists the browser rules with their tier', async () => {
    const { checks } = await docs()

    expect(
      checks.rules
        .filter((rule) => rule.tier === 'browser')
        .map((rule) => rule.id),
    ).toEqual(['clipped', 'scrollbar', 'viewport', 'min-font-size'])
  })

  it('names the minFontSize key that turns on the font size rule', async () => {
    const { checks } = await docs()

    expect(checks.rules).toContainEqual(
      expect.objectContaining({
        id: 'min-font-size',
        configKey: 'minFontSize',
      }),
    )
  })

  it('prints the check result record', async () => {
    const { records } = await docs()

    expect(records.checkResult?.type).toBe('object')
  })
})
