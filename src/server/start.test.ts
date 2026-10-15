import { mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { afterEach, beforeEach, describe, expect, it } from 'vitest'

import { BoardTabs, type RunningServer, startServer } from './start'

describe('startServer', () => {
  let clientDir: string
  let servers: RunningServer[]

  beforeEach(() => {
    clientDir = mkdtempSync(join(tmpdir(), 'frameboard-client-'))
    writeFileSync(join(clientDir, 'index.html'), '<title>Frameboard</title>')
    servers = []
  })

  afterEach(async () => {
    await Promise.all(servers.map((server) => server.close()))
    rmSync(clientDir, { recursive: true, force: true })
  })

  async function start(port: number, strictPort?: boolean) {
    const server = await startServer({
      clientDir,
      root: '/board',
      port,
      strictPort,
    })
    servers.push(server)
    return server
  }

  it('binds loopback and reports the port it bound', async () => {
    const server = await start(0)

    expect(server.hostname).toBe('127.0.0.1')
    expect(server.port).toBeGreaterThan(0)

    const response = await fetch(`http://127.0.0.1:${server.port}/`)
    expect(response.status).toBe(200)
  })

  it('falls back to another port when the default one is taken', async () => {
    const first = await start(0)

    const second = await start(first.port, false)

    expect(second.port).not.toBe(first.port)
  })

  it('fails on a taken port given explicitly', async () => {
    const first = await start(0)

    await expect(start(first.port, true)).rejects.toMatchObject({
      code: 'EADDRINUSE',
    })
  })
})

describe('BoardTabs', () => {
  it('resolves true when a tab connects within the wait', async () => {
    const tabs = new BoardTabs()

    const waiting = tabs.waitForOne(1000)
    tabs.open()

    expect(await waiting).toBe(true)
  })

  it('resolves false when no tab connects within the wait', async () => {
    expect(await new BoardTabs().waitForOne(10)).toBe(false)
  })
})
