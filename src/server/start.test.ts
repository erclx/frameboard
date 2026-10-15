import { mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { afterEach, beforeEach, describe, expect, it } from 'vitest'

import { type RunningServer, startServer } from './start'

describe('startServer', () => {
  let clientDir: string
  let server: RunningServer | undefined

  beforeEach(() => {
    clientDir = mkdtempSync(join(tmpdir(), 'frameboard-client-'))
    writeFileSync(join(clientDir, 'index.html'), '<title>Frameboard</title>')
  })

  afterEach(async () => {
    await server?.close()
    server = undefined
    rmSync(clientDir, { recursive: true, force: true })
  })

  it('binds loopback and reports the port it bound', async () => {
    server = await startServer({ clientDir, port: 0 })

    expect(server.hostname).toBe('127.0.0.1')
    expect(server.port).toBeGreaterThan(0)

    const response = await fetch(`http://127.0.0.1:${server.port}/`)
    expect(response.status).toBe(200)
  })
})
