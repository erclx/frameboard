import { describe, expect, it } from 'vitest'

import { version } from '@/shared/version'

import { createProgram } from './program'

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
