import { InvalidArgumentError } from 'commander'
import { describe, expect, it } from 'vitest'

import { version } from '@/shared/version'

import { createProgram, parsePort } from './program'

describe('createProgram', () => {
  it('prints the package version for --version', async () => {
    let output = ''
    const program = createProgram()
      .exitOverride()
      .configureOutput({ writeOut: (text) => (output += text) })

    await expect(
      program.parseAsync(['--version'], { from: 'user' }),
    ).rejects.toMatchObject({ code: 'commander.version' })
    expect(output.trim()).toBe(version)
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
