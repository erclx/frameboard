import { readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'

import { afterEach, beforeEach, describe, expect, it } from 'vitest'

import { FrameboardError } from '@/shared/errors'

import {
  copyFixtureBoard,
  type FixtureBoard,
} from '../../../test/support/fixture-board'
import { History } from '../history/stack'
import { structureRoutes } from './structure'

const TOKEN = 'a'.repeat(64)
const BEARER = { authorization: `Bearer ${TOKEN}` }
const ACCESS = {
  token: () => TOKEN,
  key: 'b'.repeat(64),
  cookieName: 'frameboard-key-111111111111',
  isOwnOrigin: () => false,
}

describe('POST /api/frame/height', () => {
  let board: FixtureBoard
  let history: History
  let app: ReturnType<typeof structureRoutes>

  beforeEach(() => {
    board = copyFixtureBoard('live')
    history = new History(board.root)
    app = structureRoutes(board.root, ACCESS, history)
  })

  afterEach(() => {
    board.cleanup()
  })

  function post(path: string, body: unknown) {
    return app.request(path, {
      method: 'POST',
      headers: { 'content-type': 'application/json', ...BEARER },
      body: JSON.stringify(body),
    })
  }

  const HERO = { x: 0, y: 0, width: 1440, height: 900 }
  const layoutPath = () => join(board.root, 'studio/home/layout.json')
  const frames = () => JSON.parse(readFileSync(layoutPath(), 'utf8')).frames
  const setHero = (fields: Record<string, unknown>) => {
    const layout = JSON.parse(readFileSync(layoutPath(), 'utf8'))
    Object.assign(layout.frames.hero, fields)
    writeFileSync(layoutPath(), JSON.stringify(layout))
  }
  const measuring = (height: number) =>
    structureRoutes(board.root, ACCESS, history, async () => ({
      width: 1440,
      height,
      contentWidth: 1440,
      empty: false,
    }))

  /** Fits the hero at 632 px of content, answering each box it was measured at. */
  const fitHero = async (box: { width: number; height: number }) => {
    const opened: { width: number; height: number }[] = []
    app = structureRoutes(
      board.root,
      ACCESS,
      history,
      async (frame, linked) => {
        const { width, height } = linked ?? frame.box
        opened.push({ width, height })
        return { width, height: 632, contentWidth: width, empty: false }
      },
    )
    await post('/api/frame/height', {
      refs: ['studio/home/hero'],
      mode: 'fit',
      expected: { 'studio/home/hero': { x: 0, y: 0, ...box } },
    })
    return opened
  }

  it('sets scroll in one undoable step', async () => {
    const response = await post('/api/frame/height', {
      refs: ['studio/home/hero'],
      mode: 'scroll',
      expected: { 'studio/home/hero': HERO },
    })

    expect(await response.json()).toMatchObject({
      ok: true,
      data: [{ ref: 'studio/home/hero', scroll: true }],
    })
    expect(history.counts().undo).toBe(1)
    await history.undo()
    expect(frames().hero.scroll).toBeUndefined()
  })

  it('lands a scroll write at the screen height its body gives', async () => {
    setHero({ height: 1992, hugHeight: true })

    await post('/api/frame/height', {
      refs: ['studio/home/hero'],
      mode: 'scroll',
      expected: { 'studio/home/hero': HERO },
      heights: { 'studio/home/hero': 1100 },
    })

    expect(frames().hero).toMatchObject({ height: 1100, scroll: true })
    expect(history.counts().undo).toBe(1)
  })

  it('refuses usage for heights on a mode other than scroll, writing nothing', async () => {
    app = measuring(2400)

    const response = await post('/api/frame/height', {
      refs: ['studio/home/hero'],
      mode: 'fit',
      expected: { 'studio/home/hero': HERO },
      heights: { 'studio/home/hero': 1100 },
    })

    expect(response.status).toBe(400)
    expect(await response.json()).toMatchObject({
      error: { code: 'usage' },
    })
    expect(history.counts().undo).toBe(0)
  })

  it('fits a scroll frame to its content, clearing scroll, and undoes back to scroll', async () => {
    setHero({ scroll: true })
    app = measuring(2400)

    const response = await post('/api/frame/height', {
      refs: ['studio/home/hero'],
      mode: 'fit',
      expected: { 'studio/home/hero': HERO },
    })

    expect(response.status).toBe(200)
    expect(frames().hero).toMatchObject({ height: 2400, hugHeight: true })
    expect(frames().hero.scroll).toBe(false)
    await history.undo()
    expect(frames().hero).toMatchObject({ height: 900, scroll: true })
  })

  it('fits each linked width to the height its content reads at that width', async () => {
    setHero({ widths: [{ width: 390, height: 844 }] })
    app = structureRoutes(board.root, ACCESS, history, async (_frame, box) => ({
      width: box?.width ?? 1440,
      height: box ? 2400 : 1232,
      contentWidth: box?.width ?? 1440,
      empty: false,
    }))

    await post('/api/frame/height', {
      refs: ['studio/home/hero'],
      mode: 'fit',
      expected: { 'studio/home/hero': HERO },
    })

    expect(frames().hero).toMatchObject({
      height: 1232,
      widths: [{ width: 390, height: 2400 }],
    })
  })

  it('fits a shown phone width to its page and the status bar above it', async () => {
    setHero({ showDevice: true, widths: [{ width: 390, height: 844 }] })
    const opened: number[] = []
    app = structureRoutes(board.root, ACCESS, history, async (_frame, box) => {
      if (box) opened.push(box.height)
      return {
        width: box?.width ?? 1440,
        height: box ? 2400 : 1232,
        contentWidth: box?.width ?? 1440,
        empty: false,
      }
    })

    await post('/api/frame/height', {
      refs: ['studio/home/hero'],
      mode: 'fit',
      expected: { 'studio/home/hero': HERO },
    })

    expect(opened).toEqual([790])
    expect(frames().hero.widths).toEqual([{ width: 390, height: 2454 }])
  })

  it('fits an upright phone to its page and the status bar above it', async () => {
    const box = { width: 390, height: 844 }
    setHero({ ...box, showDevice: true })

    const opened = await fitHero(box)

    expect(opened).toEqual([{ width: 390, height: 790 }])
    expect(frames().hero).toMatchObject({ height: 686, hugHeight: true })
  })

  it('fits a turned phone between its side strips, with no bar above it', async () => {
    const box = { width: 844, height: 390 }
    setHero({
      ...box,
      showDevice: true,
      turn: 'left',
      upright: { width: 390, height: 844 },
    })

    const opened = await fitHero(box)

    expect(opened).toEqual([{ width: 736, height: 390 }])
    expect(frames().hero).toMatchObject({ height: 632, hugHeight: true })
  })

  it('fits a turned foldable between its side strips, with no bar above it', async () => {
    const box = { width: 678, height: 466 }
    setHero({
      ...box,
      showDevice: true,
      foldable: true,
      pose: 'closed',
      turn: 'left',
      upright: { width: 466, height: 678 },
    })

    const opened = await fitHero(box)

    expect(opened).toEqual([{ width: 570, height: 466 }])
    expect(frames().hero).toMatchObject({ height: 632, hugHeight: true })
  })

  it('fits a phone width with its device off to its content alone', async () => {
    const box = { width: 390, height: 844 }
    setHero(box)

    const opened = await fitHero(box)

    expect(opened).toEqual([{ width: 390, height: 844 }])
    expect(frames().hero).toMatchObject({ height: 632, hugHeight: true })
  })

  it('refuses a fit of content sized off the viewport with 422, writing nothing', async () => {
    app = structureRoutes(board.root, ACCESS, history, async () => {
      throw new FrameboardError('fit-unbounded', 'Grows with the viewport.')
    })

    const response = await post('/api/frame/height', {
      refs: ['studio/home/hero'],
      mode: 'fit',
      expected: { 'studio/home/hero': HERO },
    })

    expect(response.status).toBe(422)
    expect(await response.json()).toMatchObject({
      error: { code: 'fit-unbounded' },
    })
    expect(history.counts().undo).toBe(0)
  })

  it('refuses a fit with browser-not-found, 503, where no browser runs', async () => {
    const response = await post('/api/frame/height', {
      refs: ['studio/home/hero'],
      mode: 'fit',
      expected: { 'studio/home/hero': HERO },
    })

    expect(response.status).toBe(503)
    expect(await response.json()).toMatchObject({
      error: { code: 'browser-not-found' },
    })
  })

  it('fixes a hugging height where it stands', async () => {
    setHero({ height: 1232, hugHeight: true })

    await post('/api/frame/height', {
      refs: ['studio/home/hero'],
      mode: 'fixed',
      expected: { 'studio/home/hero': { ...HERO, height: 1000 } },
    })

    expect(frames().hero.height).toBe(1232)
    expect(frames().hero.hugHeight).toBe(false)
  })

  it('sets every listed frame in one step', async () => {
    await post('/api/frame/height', {
      refs: ['studio/home/hero', 'studio/home/mobile'],
      mode: 'scroll',
      expected: {
        'studio/home/hero': HERO,
        'studio/home/mobile': { x: 1520, y: 0, width: 390, height: 844 },
      },
    })

    expect(frames().hero.scroll).toBe(true)
    expect(frames().mobile.scroll).toBe(true)
    expect(history.counts().undo).toBe(1)
  })

  it('refuses stale-layout with 409 when the frame moved since, writing nothing', async () => {
    const response = await post('/api/frame/height', {
      refs: ['studio/home/hero'],
      mode: 'scroll',
      expected: { 'studio/home/hero': { ...HERO, height: 700 } },
    })

    expect(response.status).toBe(409)
    expect(await response.json()).toMatchObject({
      error: { code: 'stale-layout' },
    })
    expect(frames().hero.scroll).toBeUndefined()
    expect(history.counts().undo).toBe(0)
  })

  it('writes no frame when a later one is stale', async () => {
    const response = await post('/api/frame/height', {
      refs: ['studio/home/hero', 'studio/home/mobile'],
      mode: 'scroll',
      expected: {
        'studio/home/hero': HERO,
        'studio/home/mobile': { x: 1520, y: 0, width: 390, height: 700 },
      },
    })

    expect(response.status).toBe(409)
    expect(frames().hero.scroll).toBeUndefined()
    expect(frames().mobile.scroll).toBeUndefined()
    expect(history.counts().undo).toBe(0)
  })

  it('refuses a locked frame with 423, writing nothing', async () => {
    setHero({ locked: true })

    const response = await post('/api/frame/height', {
      refs: ['studio/home/hero'],
      mode: 'scroll',
      expected: { 'studio/home/hero': HERO },
    })

    expect(response.status).toBe(423)
    expect(frames().hero.scroll).toBeUndefined()
  })

  it('refuses usage for a frame the body gives no expected box', async () => {
    const response = await post('/api/frame/height', {
      refs: ['studio/home/hero'],
      mode: 'fixed',
      expected: {},
    })

    expect(response.status).toBe(400)
  })
})
