import { afterEach, beforeEach, describe, expect, it } from 'vitest'

import { createLiveStore, liveStore, receiveBoard } from '@/client/live/store'
import { boardOf, frameOf, pageOf } from '@/test/board'

import { followPending, withPending, writeBoxes } from './write'

const HERO = frameOf('hero', { box: { x: 0, y: 0, width: 390, height: 844 } })
const MOVED = { x: 40, y: 0, width: 390, height: 844 }

function answering(status: number, body: unknown): typeof fetch {
  return async () => Response.json(body, { status })
}

function drawnBox() {
  return withPending([HERO])[0]?.box
}

describe('writeBoxes', () => {
  let stop = () => {}

  beforeEach(() => {
    liveStore.setState({ canWrite: true })
  })

  afterEach(() => {
    stop()
  })

  it('posts frame names with the boxes the edit started from', async () => {
    let body: unknown = null
    const send: typeof fetch = async (_path, init) => {
      body = JSON.parse(String(init?.body))
      return Response.json({ ok: true, data: { frames: [] } })
    }

    await writeBoxes(
      'studio/home',
      { [HERO.ref]: MOVED },
      { [HERO.ref]: HERO.box },
      send,
    )

    expect(body).toEqual({
      page: 'studio/home',
      boxes: { hero: MOVED },
      expected: { hero: HERO.box },
    })
  })

  it('holds the new box after the write lands, until a board carries it', async () => {
    const live = createLiveStore()
    stop = followPending(live)

    await writeBoxes(
      'studio/home',
      { [HERO.ref]: MOVED },
      { [HERO.ref]: HERO.box },
      answering(200, { ok: true, data: { frames: [] } }),
    )
    const held = drawnBox()
    receiveBoard(live, boardOf(pageOf([{ ...HERO, box: MOVED }])))

    expect(held).toEqual(MOVED)
    expect(withPending([HERO])[0]).toBe(HERO)
  })

  it('keeps the new box through a board that still carries the old one', async () => {
    const live = createLiveStore()
    stop = followPending(live)
    let release = () => {}
    const send: typeof fetch = () =>
      new Promise((resolve) => {
        release = () =>
          resolve(Response.json({ ok: true, data: { frames: [] } }))
      })

    const written = writeBoxes(
      'studio/home',
      { [HERO.ref]: MOVED },
      { [HERO.ref]: HERO.box },
      send,
    )
    receiveBoard(live, boardOf(pageOf([HERO])))

    expect(drawnBox()).toEqual(MOVED)
    release()
    await written
    receiveBoard(live, boardOf(pageOf([{ ...HERO, box: MOVED }])))
  })

  it('drops the new box when the server refuses it', async () => {
    const landed = await writeBoxes(
      'studio/home',
      { [HERO.ref]: MOVED },
      { [HERO.ref]: HERO.box },
      answering(409, {
        ok: false,
        error: { code: 'stale-layout', message: 'Moved since.' },
      }),
    )

    expect(landed).toBe(false)
    expect(drawnBox()).toEqual(HERO.box)
  })
})
