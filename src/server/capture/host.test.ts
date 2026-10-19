import { request } from 'node:http'
import { join } from 'node:path'

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

/** The host's options over a temp board, with the faces in a dot folder the board skips. */
function onBoard(board: TempBoard) {
  return { root: board.root, facesDir: join(board.root, '.faces') }
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
    host = await startFrameHost(onBoard(board))

    const response = await fetch(`${host.url}/frames/studio/home/hero.html`)

    expect(response.status).toBe(200)
    expect(await response.text()).toMatch(
      /^<style data-frameboard[^>]*>.*<\/script><p>Hello<\/p>$/s,
    )
  })

  it('refuses a Host other than its own loopback address', async () => {
    board = writeBoard({ 'studio/home/hero.html': '<p>Hello</p>' })
    host = await startFrameHost(onBoard(board))

    const response = await get(
      `${host.url}/frames/studio/home/hero.html`,
      'attacker.example',
    )

    expect(response.status).toBe(403)
  })

  it('serves the faces and the board sheet a frame imports', async () => {
    board = writeBoard({
      'studio/home/hero.html': '<p>Hello</p>',
      'tokens.css': ':root { --fg: teal }',
      '.faces/geist/index.css': '@font-face {}',
    })
    host = await startFrameHost(onBoard(board))

    const [face, sheet] = await Promise.all([
      fetch(`${host.url}/frameboard/faces/geist/index.css`),
      fetch(`${host.url}/frameboard/tokens.css`),
    ])

    expect(await face.text()).toBe('@font-face {}')
    expect(await sheet.text()).toBe(':root { --fg: teal }')
  })

  it('serves nothing but frames and their look', async () => {
    board = writeBoard({ 'studio/home/hero.html': '<p>Hello</p>' })
    host = await startFrameHost(onBoard(board))

    const response = await fetch(`${host.url}/api/health`)

    expect(response.status).toBe(404)
  })
})
