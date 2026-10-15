import { mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { afterEach, beforeEach, describe, expect, it } from 'vitest'

import { version } from '@/shared/version'

import { createApp } from './app'

describe('createApp', () => {
  let clientDir: string

  beforeEach(() => {
    clientDir = mkdtempSync(join(tmpdir(), 'frameboard-client-'))
    writeFileSync(join(clientDir, 'index.html'), '<title>Frameboard</title>')
  })

  afterEach(() => {
    rmSync(clientDir, { recursive: true, force: true })
  })

  it('serves the client index with the version header', async () => {
    const response = await createApp({ clientDir }).request('/')

    expect(response.status).toBe(200)
    expect(response.headers.get('x-frameboard-version')).toBe(version)
    expect(await response.text()).toContain('<title>Frameboard</title>')
  })
})
