import { afterEach, beforeEach, describe, expect, it } from 'vitest'

import {
  createLiveStore,
  liveStore,
  receiveBoard,
  receiveClaims,
} from '@/client/live/store'
import { boardOf, frameOf, pageOf } from '@/test/board'

import { dropWaiting } from '../claims/waiting'
import { endPreview, previewOf, setPreview } from '../preview/store'
import {
  dropPending,
  followPending,
  holdBoxes,
  withDrawn,
  withPending,
  writeBoxes,
} from './write'

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

  describe('on a frame another session holds', () => {
    const RESIZED = { x: 40, y: 0, width: 500, height: 844 }
    let bodies: unknown[]
    const send: typeof fetch = async (_path, init) => {
      bodies.push(JSON.parse(String(init?.body)))
      return Response.json({ ok: true, data: { frames: [] } })
    }

    beforeEach(() => {
      bodies = []
      liveStore.setState({ connected: true })
      receiveClaims(liveStore, [
        {
          frame: HERO.ref,
          session: 'sess-a',
          agent: 'claude',
          tag: 'claude · visual-style',
          claimedAt: '2026-10-19T10:00:00.000Z',
          expiresAt: '2099-10-19T10:05:00.000Z',
        },
      ])
    })

    afterEach(() => {
      dropWaiting()
      receiveClaims(liveStore, [])
    })

    it('keeps the new box on screen and sends nothing while the claim holds', async () => {
      const written = writeBoxes(
        'studio/home',
        { [HERO.ref]: MOVED },
        { [HERO.ref]: HERO.box },
        send,
      )
      await Promise.resolve()

      expect(drawnBox()).toEqual(MOVED)
      expect(bodies).toEqual([])
      dropWaiting()
      await written
    })

    it('sends once the claim drops, with the box the edit started from', async () => {
      const written = writeBoxes(
        'studio/home',
        { [HERO.ref]: MOVED },
        { [HERO.ref]: HERO.box },
        send,
      )

      receiveClaims(liveStore, [])

      expect(await written).toBe(true)
      expect(bodies).toEqual([
        {
          page: 'studio/home',
          boxes: { hero: MOVED },
          expected: { hero: HERO.box },
        },
      ])
    })

    it('sends only the newer of two waiting edits, with the older one’s starting box', async () => {
      const older = writeBoxes(
        'studio/home',
        { [HERO.ref]: MOVED },
        { [HERO.ref]: HERO.box },
        send,
      )
      // The resize starts from the move's box, which only the board draws.
      const newer = writeBoxes(
        'studio/home',
        { [HERO.ref]: RESIZED },
        { [HERO.ref]: MOVED },
        send,
      )

      expect(await older).toBe(false)
      receiveClaims(liveStore, [])
      expect(await newer).toBe(true)
      expect(bodies).toEqual([
        {
          page: 'studio/home',
          boxes: { hero: RESIZED },
          expected: { hero: HERO.box },
        },
      ])
    })

    it('carries a waiting arrange’s other frame into a newer nudge of one of them', async () => {
      const ABOUT = 'studio/home/about'
      const aboutBox = { x: 1520, y: 0, width: 390, height: 844 }
      const aboutArranged = { ...aboutBox, y: 56 }
      const older = writeBoxes(
        'studio/home',
        { [HERO.ref]: MOVED, [ABOUT]: aboutArranged },
        { [HERO.ref]: HERO.box, [ABOUT]: aboutBox },
        send,
      )
      // The nudge starts from the arranged box the board draws for the about frame.
      const newer = writeBoxes(
        'studio/home',
        { [ABOUT]: { ...aboutArranged, x: 1530 } },
        { [ABOUT]: aboutArranged },
        send,
      )

      expect(await older).toBe(false)
      receiveClaims(liveStore, [])
      expect(await newer).toBe(true)
      expect(bodies).toEqual([
        {
          page: 'studio/home',
          boxes: { about: { ...aboutArranged, x: 1530 }, hero: MOVED },
          expected: { about: aboutBox, hero: HERO.box },
        },
      ])
    })

    it('drops the new box and sends nothing when the wait is cancelled', async () => {
      const written = writeBoxes(
        'studio/home',
        { [HERO.ref]: MOVED },
        { [HERO.ref]: HERO.box },
        send,
      )

      dropWaiting()

      expect(await written).toBe(false)
      expect(drawnBox()).toEqual(HERO.box)
      expect(bodies).toEqual([])
    })
  })
})

describe('a previewed frame', () => {
  afterEach(() => {
    endPreview([HERO.ref])
  })

  it('hands a write its stored box, never the previewed width', () => {
    setPreview([HERO.ref], 1440)

    expect(withPending([HERO])[0]?.box).toEqual(HERO.box)
    expect(withDrawn([HERO])[0]?.box).toEqual({ ...HERO.box, width: 1440 })
  })

  it('leaves its preview when a write of its box goes out', async () => {
    liveStore.setState({ canWrite: true })
    setPreview([HERO.ref], 1440)

    await writeBoxes(
      'studio/home',
      { [HERO.ref]: MOVED },
      { [HERO.ref]: HERO.box },
      answering(200, { ok: true, data: { frames: [] } }),
    )

    expect(previewOf(HERO.ref)).toBeUndefined()
  })

  it('leaves its preview when a nudge holds its box', () => {
    setPreview([HERO.ref], 1440)

    holdBoxes({ [HERO.ref]: MOVED })
    dropPending([HERO.ref])

    expect(previewOf(HERO.ref)).toBeUndefined()
  })
})
