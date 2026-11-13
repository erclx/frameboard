import { mkdirSync, symlinkSync, writeFileSync } from 'node:fs'
import { createServer } from 'node:net'
import { join } from 'node:path'

import { afterEach, beforeEach, describe, expect, it } from 'vitest'

import { version } from '@/shared/version'

import {
  copyFixtureBoard,
  type FixtureBoard,
} from '../../../test/support/fixture-board'
import { previewApp, startPreviewListener } from './listener'

const TOKEN = 'k3P9xQ-token'

describe('previewApp', () => {
  let board: FixtureBoard
  let facesDir: string

  beforeEach(() => {
    board = copyFixtureBoard('live')
    facesDir = join(board.root, '..', 'faces')
    mkdirSync(join(facesDir, 'geist'), { recursive: true })
    writeFileSync(join(facesDir, 'geist/index.css'), '@font-face {}')
    writeFileSync(join(board.root, 'studio/assets/clip.mp4'), '0123456789')
    mkdirSync(join(board.root, 'other/home'), { recursive: true })
    writeFileSync(join(board.root, 'other/home/secret.html'), '<p>secret</p>')
    mkdirSync(join(board.root, '.run'))
    writeFileSync(join(board.root, '.run/address.json'), '{"token":"t"}')
  })

  afterEach(() => {
    board.cleanup()
  })

  function request(path: string, init?: RequestInit) {
    return previewApp(TOKEN, {
      root: board.root,
      project: 'studio',
      facesDir,
    }).request(path, init)
  }

  describe('what it serves', () => {
    it('serves a frame of the project with its sheets imported under the link', async () => {
      const response = await request(`/v/${TOKEN}/frames/studio/home/hero.html`)

      expect(response.status).toBe(200)
      const html = await response.text()
      expect(html).toContain('<h1>Studio</h1>')
      expect(html).toContain(
        `@import url("/v/${TOKEN}/frameboard/faces/v${version}/geist/index.css")`,
      )
    })

    it('serves a byte range of an asset, so a video seeks', async () => {
      const response = await request(
        `/v/${TOKEN}/frames/studio/assets/clip.mp4`,
        { headers: { Range: 'bytes=2-5' } },
      )

      expect(response.status).toBe(206)
      expect(await response.text()).toBe('2345')
    })

    it('serves a face the frame imports', async () => {
      const response = await request(
        `/v/${TOKEN}/frameboard/faces/v${version}/geist/index.css`,
      )

      expect(response.status).toBe(200)
      expect(await response.text()).toBe('@font-face {}')
    })

    it('answers HEAD for a frame', async () => {
      const response = await request(
        `/v/${TOKEN}/frames/studio/home/hero.html`,
        { method: 'HEAD' },
      )

      expect(response.status).toBe(200)
    })
  })

  describe('what it refuses', () => {
    it.each([
      ['a wrong token', '/v/wrong-token-1/frames/studio/home/hero.html'],
      ['no token', '/frames/studio/home/hero.html'],
      ['another project', `/v/${TOKEN}/frames/other/home/secret.html`],
      [
        'another project by dot segments',
        `/v/${TOKEN}/frames/studio/../other/home/secret.html`,
      ],
      [
        'another project by encoded dot segments',
        `/v/${TOKEN}/frames/studio/%2e%2e/other/home/secret.html`,
      ],
      [
        'another project behind an encoded slash',
        `/v/${TOKEN}/frames/studio%2F..%2Fother/home/secret.html`,
      ],
      ["a page's layout record", `/v/${TOKEN}/frames/studio/home/layout.json`],
      ['the project record', `/v/${TOKEN}/frames/studio/project.json`],
      ['a dot-named path', `/v/${TOKEN}/frames/studio/.run/address.json`],
      ['the board folder dot path', `/v/${TOKEN}/frames/.run/address.json`],
      ['a board api route', `/v/${TOKEN}/api/health`],
      ['the board api route bare', '/api/health'],
      ['the board home', `/v/${TOKEN}/`],
    ])('answers 404 for %s', async (_case, path) => {
      const response = await request(path)

      expect(response.status).toBe(404)
    })

    it.each([
      ["a page's layout record", 'lay.json', '../home/layout.json'],
      ['the project record', 'proj.json', '../project.json'],
      ['a dot-named file', 'secret.txt', '../.secret'],
      ['a file in a dot-named folder', 'git-config', '../.git/config'],
    ])(
      'answers 404 for an asset symlink reaching %s',
      async (_case, link, target) => {
        mkdirSync(join(board.root, 'studio/.git'), { recursive: true })
        writeFileSync(join(board.root, 'studio/.git/config'), '[core]')
        writeFileSync(join(board.root, 'studio/.secret'), 'secret')
        symlinkSync(target, join(board.root, 'studio/assets', link))

        const response = await request(
          `/v/${TOKEN}/frames/studio/assets/${link}`,
        )

        expect(response.status).toBe(404)
      },
    )

    it('serves an asset symlink reaching a frame of the same project', async () => {
      symlinkSync('../home/hero.html', join(board.root, 'studio/assets/hero'))

      const response = await request(`/v/${TOKEN}/frames/studio/assets/hero`)

      expect(response.status).toBe(200)
    })

    it.each(['POST', 'PUT', 'DELETE', 'PATCH'])(
      'answers 404 for a %s to a frame it would serve',
      async (method) => {
        const response = await request(
          `/v/${TOKEN}/frames/studio/home/hero.html`,
          { method },
        )

        expect(response.status).toBe(404)
      },
    )
  })
})

describe('startPreviewListener', () => {
  let board: FixtureBoard
  const closers: (() => Promise<void>)[] = []

  beforeEach(() => {
    board = copyFixtureBoard('live')
  })

  afterEach(async () => {
    await Promise.all(closers.splice(0).map((close) => close()))
    board.cleanup()
  })

  async function start(port = 0) {
    const listener = await startPreviewListener({
      root: board.root,
      project: 'studio',
      facesDir: join(board.root, '..', 'faces'),
      host: '127.0.0.1',
      port,
    })
    closers.push(listener.close)
    return listener
  }

  it('binds the address it is given alone, so another local address is refused', async () => {
    const listener = await start()

    const elsewhere = fetch(
      `http://127.0.0.2:${listener.port}/v/${listener.token}/frames/studio/home/hero.html`,
    )

    expect(listener.host).toBe('127.0.0.1')
    await expect(elsewhere).rejects.toThrow()
  })

  function frameUrl(port: number, token: string) {
    return `http://127.0.0.1:${port}/v/${token}/frames/studio/home/hero.html`
  }

  it('serves the project over HTTP until it closes', async () => {
    const listener = await start()

    const open = await fetch(frameUrl(listener.port, listener.token))
    await listener.close()
    const closed = fetch(frameUrl(listener.port, listener.token))

    expect(open.status).toBe(200)
    await expect(closed).rejects.toThrow()
  })

  it('mints a new token on every start', async () => {
    const first = await start()
    const second = await start()

    expect(second.token).not.toBe(first.token)
  })

  it('takes a free port when the one asked for is taken', async () => {
    const holder = createServer()
    await new Promise<void>((resolve) => holder.listen(0, '0.0.0.0', resolve))
    closers.push(() => new Promise((resolve) => holder.close(() => resolve())))
    const taken = (holder.address() as { port: number }).port

    const listener = await start(taken)

    expect(listener.port).not.toBe(taken)
    const response = await fetch(frameUrl(listener.port, listener.token))
    expect(response.status).toBe(200)
  })
})
