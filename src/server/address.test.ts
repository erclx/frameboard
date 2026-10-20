import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  realpathSync,
  rmSync,
  statSync,
  writeFileSync,
} from 'node:fs'
import { createServer } from 'node:http'
import type { AddressInfo } from 'node:net'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { afterEach, beforeEach, describe, expect, it } from 'vitest'

import { addressFileSchema } from '@/shared/records/address'

import {
  addressPath,
  findLiveServer,
  newAddress,
  removeAddress,
  writeAddress,
} from './address'
import { type RunningServer, startServer } from './start'

describe('address', () => {
  let root: string
  let server: RunningServer | undefined

  beforeEach(() => {
    root = realpathSync(mkdtempSync(join(tmpdir(), 'frameboard-address-')))
    writeFileSync(join(root, 'index.html'), '<title>Frameboard</title>')
  })

  afterEach(async () => {
    await server?.close()
    server = undefined
    rmSync(root, { recursive: true, force: true })
  })

  async function serveBoard(boardRoot: string): Promise<RunningServer> {
    server = await startServer({
      clientDir: root,
      facesDir: root,
      root: boardRoot,
      port: 0,
      openUrl: () => {},
    })
    return server
  }

  describe('writeAddress', () => {
    it('writes a record its schema accepts, mode 0600, in a self-ignored folder', async () => {
      await writeAddress(
        root,
        newAddress({ root, host: '127.0.0.1', port: 4173 }),
      )

      const record = JSON.parse(readFileSync(addressPath(root), 'utf8'))
      expect(addressFileSchema.safeParse(record).success).toBe(true)
      expect(statSync(addressPath(root)).mode & 0o777).toBe(0o600)
      expect(readFileSync(join(root, '.run/.gitignore'), 'utf8')).toBe('*\n')
    })
  })

  describe('removeAddress', () => {
    it('leaves a file holding another token', async () => {
      await writeAddress(
        root,
        newAddress({ root, host: '127.0.0.1', port: 4173 }),
      )

      await removeAddress(root, 'f'.repeat(64))

      expect(existsSync(addressPath(root))).toBe(true)
    })

    it('removes the file holding its own token', async () => {
      const address = newAddress({ root, host: '127.0.0.1', port: 4173 })
      await writeAddress(root, address)

      await removeAddress(root, address.token)

      expect(existsSync(addressPath(root))).toBe(false)
    })
  })

  describe('findLiveServer', () => {
    it('finds a server answering for the same board', async () => {
      const running = await serveBoard(root)
      const address = newAddress({
        root,
        host: '127.0.0.1',
        port: running.port,
      })
      await writeAddress(root, address)

      expect(await findLiveServer(root)).toEqual(address)
    })

    it('reads a live pid serving another board as stale', async () => {
      const other = join(root, 'another-board')
      mkdirSync(other)
      const running = await serveBoard(other)
      await writeAddress(
        root,
        newAddress({ root, host: '127.0.0.1', port: running.port }),
      )

      expect(await findLiveServer(root)).toBeNull()
    })

    it('waits out a live server slow to answer its health check', async () => {
      const slow = createServer((_request, response) => {
        setTimeout(() => {
          response.setHeader('content-type', 'application/json')
          response.end(JSON.stringify({ root }))
        }, 1000)
      })
      await new Promise<void>((resolve) => slow.listen(0, '127.0.0.1', resolve))
      const { port } = slow.address() as AddressInfo
      const address = newAddress({ root, host: '127.0.0.1', port })
      await writeAddress(root, address)

      try {
        expect(await findLiveServer(root)).toEqual(address)
      } finally {
        slow.closeAllConnections()
        await new Promise((resolve) => slow.close(resolve))
      }
    })

    it('reads a missing file as no server', async () => {
      expect(await findLiveServer(root)).toBeNull()
    })
  })
})
