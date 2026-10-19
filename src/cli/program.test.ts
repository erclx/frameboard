import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { InvalidArgumentError } from 'commander'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'

import { version } from '@/shared/version'

import { cli } from '../../test/support/cli'
import { parseInteger, parsePort } from './program'

describe('runCli', () => {
  let cwd: string

  beforeEach(() => {
    cwd = mkdtempSync(join(tmpdir(), 'frameboard-cli-'))
  })

  afterEach(() => {
    rmSync(cwd, { recursive: true, force: true })
  })

  it('prints the package version for --version', async () => {
    const run = await cli(['--version'], { cwd })

    expect(run.exitCode).toBe(0)
    expect(run.stdout.trim()).toBe(version)
  })

  it('prints one usage envelope and no help text for an unknown flag under --json', async () => {
    const run = await cli(['list', '--json', '--bogus'], { cwd })

    expect(run.exitCode).toBe(2)
    expect(run.json()).toMatchObject({
      ok: false,
      error: { code: 'usage' },
    })
    expect(run.stderr).toBe('')
  })

  it('leaves commander to print a parse error without --json', async () => {
    const run = await cli(['list', '--bogus'], { cwd })

    expect(run.exitCode).toBe(2)
    expect(run.stdout).toBe('')
    expect(run.stderr).toContain('--bogus')
  })

  it('prints a failure to stderr without --json', async () => {
    const run = await cli(['list'], { cwd })

    expect(run.exitCode).toBe(3)
    expect(run.stderr).toMatch(/^frameboard: No board\.json/)
  })

  it('names the verbs of a group run with no verb under --json', async () => {
    const run = await cli(['page', '--json'], { cwd })

    expect(run.exitCode).toBe(2)
    expect(run.json().error).toMatchObject({
      code: 'usage',
      details: {
        commands: ['add', 'duplicate', 'rename', 'move', 'delete'],
      },
    })
  })

  it('names the top-level commands when none is given under --json', async () => {
    const run = await cli(['--json'], { cwd })

    expect(run.json().error?.message).toMatch(
      /^frameboard needs a command, one of serve, show, selection, list,/,
    )
  })
})

describe('parsePort', () => {
  it.each(['0', '4173', '65535'])('accepts %s', (value) => {
    expect(parsePort(value)).toBe(Number(value))
  })

  it.each(['', ' ', '4173.5', '-1', '65536', '1e3', '0x10', 'abc'])(
    'rejects %j',
    (value) => {
      expect(() => parsePort(value)).toThrow(InvalidArgumentError)
    },
  )
})

describe('parseInteger', () => {
  it('accepts a negative integer with no floor', () => {
    expect(parseInteger(Number.MIN_SAFE_INTEGER)('-40')).toBe(-40)
  })

  it.each(['0', '1.5', 'x', ''])('rejects %j under a floor of 1', (value) => {
    expect(() => parseInteger(1)(value)).toThrow(InvalidArgumentError)
  })
})
