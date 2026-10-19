import { request } from 'node:http'

import { afterEach, describe, expect, it } from 'vitest'

import { type TempBoard, writeBoard } from '../../../test/support/temp-board'
import { type FrameHost, startFrameHost } from './host'

/** A GET with the `Host` header set by hand, which `fetch` refuses to do. */
function get(
  url: string,
  host: string,
): Promise<{ status: number; body: string }> {
  return new Promise((done, fail) => {
    const req = request(url, { headers: { host } }, (response) => {
      let body = ''
      response.on('data', (chunk: Buffer) => (body += chunk.toString()))
      response.on('end', () => done({ status: response.statusCode ?? 0, body }))
    })
    req.once('error', fail)
    req.end()
  })
}

describe('startFrameHost', () => {
  let board: TempBoard
  let host: FrameHost

  afterEach(async () => {
    await host.close()
    board.cleanup()
  })

  it('serves a frame on loopback with the look spliced ahead of its bytes', async () => {
    board = writeBoard({ 'studio/home/hero.html': '<p>Hello</p>' })
    host = await startFrameHost(board.root)

    const response = await fetch(`${host.url}/frames/studio/home/hero.html`)

    expect(response.status).toBe(200)
    expect(await response.text()).toMatch(
      /^<style data-frameboard>.*<\/script><p>Hello<\/p>$/s,
    )
  })

  it('refuses a Host other than its own loopback address', async () => {
    board = writeBoard({ 'studio/home/hero.html': '<p>Hello</p>' })
    host = await startFrameHost(board.root)

    const response = await get(
      `${host.url}/frames/studio/home/hero.html`,
      'attacker.example',
    )

    expect(response.status).toBe(403)
  })

  it('serves nothing but frames', async () => {
    board = writeBoard({ 'studio/home/hero.html': '<p>Hello</p>' })
    host = await startFrameHost(board.root)

    const response = await fetch(`${host.url}/api/health`)

    expect(response.status).toBe(404)
  })
})
