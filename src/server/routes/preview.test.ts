import { join } from 'node:path'

import { afterEach, describe, expect, it } from 'vitest'

import { createPreviewSlot } from '@/server/preview/listener'

import { type TempBoard, writeBoard } from '../../../test/support/temp-board'
import { previewRoutes } from './preview'

const TOKEN = 'a'.repeat(64)

interface Started {
  url: string
  port: number
  token: string
  project: string
  ref: string
}

describe('/api/preview', () => {
  let board: TempBoard
  let stopAll: () => Promise<unknown> = async () => undefined

  afterEach(async () => {
    await stopAll()
    board.cleanup()
  })

  function setup(address: string | null = '127.0.0.1') {
    board = writeBoard({
      'studio/home/hero.html': '<h1>Studio</h1>',
      'studio/home/about.html': '<p>About</p>',
    })
    const slot = createPreviewSlot({
      root: board.root,
      facesDir: join(board.root, '..', 'faces'),
    })
    stopAll = () => slot.stop()
    const routes = previewRoutes(
      board.root,
      {
        token: () => TOKEN,
        key: 'b'.repeat(64),
        cookieName: 'frameboard-key-111111111111',
        isOwnOrigin: () => false,
      },
      slot,
      { address: () => address },
    )
    const send = (
      method: 'POST' | 'DELETE',
      body: unknown,
      token: string | null = TOKEN,
    ) =>
      routes.request('/api/preview', {
        method,
        headers: {
          'content-type': 'application/json',
          ...(token === null ? {} : { authorization: `Bearer ${token}` }),
        },
        body: body === undefined ? undefined : JSON.stringify(body),
      })
    const start = async (body: unknown) => {
      const response = await send('POST', body)
      const { data } = (await response.json()) as { data: Started }
      return data
    }
    return { send, start }
  }

  it('starts a listener and answers a link landing on the frame', async () => {
    const { start } = setup()

    const started = await start({ ref: 'studio/home/hero', port: 0 })

    expect(started.url).toBe(
      `http://127.0.0.1:${started.port}/v/${started.token}/frames/studio/home/hero.html`,
    )
    expect(started.ref).toBe('studio/home/hero')
    const page = await fetch(started.url)
    expect(page.status).toBe(200)
    expect(await page.text()).toContain('<h1>Studio</h1>')
  })

  it('answers a new token on a second start, and the first link stops answering', async () => {
    const { start } = setup()

    const first = await start({ ref: 'studio/home/hero', port: 0 })
    const second = await start({ ref: 'studio/home/about', port: 0 })

    expect(second.token).not.toBe(first.token)
    expect((await fetch(second.url)).status).toBe(200)
    const stale = await fetch(first.url).catch(() => null)
    expect(stale?.status ?? 'closed').not.toBe(200)
  })

  it('ends the link on a stop with no body', async () => {
    const { send, start } = setup()
    const started = await start({ ref: 'studio/home/hero', port: 0 })

    const response = await send('DELETE', undefined)

    expect(await response.json()).toEqual({ ok: true, data: { stopped: true } })
    await expect(fetch(started.url)).rejects.toThrow()
  })

  it('leaves the link running on a stop naming an older token', async () => {
    const { send, start } = setup()
    const started = await start({ ref: 'studio/home/hero', port: 0 })

    const response = await send('DELETE', { token: 'older-token' })

    expect(await response.json()).toEqual({
      ok: true,
      data: { stopped: false },
    })
    expect((await fetch(started.url)).status).toBe(200)
  })

  it('refuses no-network-address and starts nothing on a machine off any local network', async () => {
    const { send } = setup(null)

    const response = await send('POST', { ref: 'studio/home/hero', port: 0 })
    const stop = await send('DELETE', undefined)

    expect(response.status).toBe(503)
    expect(await response.json()).toMatchObject({
      ok: false,
      error: { code: 'no-network-address' },
    })
    expect(await stop.json()).toEqual({ ok: true, data: { stopped: false } })
  })

  it('refuses a frame the board does not hold', async () => {
    const { send } = setup()

    const response = await send('POST', { ref: 'studio/home/missing' })

    expect(response.status).toBe(404)
    expect(await response.json()).toMatchObject({
      error: { code: 'frame-not-found' },
    })
  })

  it('refuses a caller without the board token', async () => {
    const { send } = setup()

    const response = await send('POST', { ref: 'studio/home/hero' }, null)

    expect(response.status).toBe(401)
  })
})
