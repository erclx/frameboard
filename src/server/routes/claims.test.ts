import { afterEach, describe, expect, it } from 'vitest'

import { claim, readClaims, reserve } from '@/server/claims/store'

import { type TempBoard, writeBoard } from '../../../test/support/temp-board'
import { claimsRoutes } from './claims'

const TOKEN = 'a'.repeat(64)
const BOX = { x: 0, y: 0, width: 400, height: 300 }

describe('POST /api/claims/release', () => {
  let board: TempBoard

  afterEach(() => {
    board.cleanup()
  })

  async function setup() {
    board = writeBoard({ 'studio/home/hero.html': '<p>Hello</p>' })
    const now = new Date()
    await reserve(
      board.root,
      { session: 'sess-a', agent: 'claude', tag: 'claude · a' },
      [
        { frame: 'studio/home/one', box: BOX },
        { frame: 'studio/home/two', box: { ...BOX, x: 480 } },
      ],
      now,
    )
    await claim(
      board.root,
      {
        frame: 'studio/home/hero',
        session: 'sess-a',
        agent: 'claude',
        tag: 'claude · a',
      },
      now,
    )
    const routes = claimsRoutes(board.root, {
      token: () => TOKEN,
      key: 'b'.repeat(64),
      cookieName: 'frameboard-key-111111111111',
      isOwnOrigin: () => false,
    })
    return (frame: string, token: string | null = TOKEN) =>
      routes.request('/api/claims/release', {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          ...(token === null ? {} : { authorization: `Bearer ${token}` }),
        },
        body: JSON.stringify({ frame }),
      })
  }

  async function heldFrames(): Promise<string[]> {
    return (await readClaims(board.root, new Date())).map((each) => each.frame)
  }

  it('drops the named reservation and leaves the session other claims', async () => {
    const release = await setup()

    const response = await release('studio/home/one')

    expect(response.status).toBe(200)
    expect(await heldFrames()).toEqual(['studio/home/two', 'studio/home/hero'])
  })

  it('refuses a request without a writing tab and drops nothing', async () => {
    const release = await setup()

    const response = await release('studio/home/one', null)

    expect(response.status).toBe(401)
    expect(await heldFrames()).toHaveLength(3)
  })

  it('refuses an editing claim on an existing frame as frame-not-found', async () => {
    const release = await setup()

    const response = await release('studio/home/hero')

    expect(response.status).toBe(404)
    expect(await heldFrames()).toHaveLength(3)
  })
})
