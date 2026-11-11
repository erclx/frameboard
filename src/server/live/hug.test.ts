import { readFileSync, utimesSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'

import { afterEach, describe, expect, it } from 'vitest'

import type { ContentSize } from '@/server/capture/fit'
import { FrameboardError } from '@/shared/errors'
import type { FrameRecord } from '@/shared/records/list'

import { type TempBoard, writeBoard } from '../../../test/support/temp-board'
import { scanBoard } from '../board/scan'
import { createHug, ownFileRefs, writtenSinceLayout } from './hug'

const CARD = 'studio/home/card'
const HERO = 'studio/home/hero'

function boardOf(flags: { card?: object; hero?: object } = {}): TempBoard {
  return writeBoard({
    'studio/home/card.html': '<p>card</p>',
    'studio/home/hero.html': '<p>hero</p>',
    'studio/home/layout.json': JSON.stringify({
      version: 1,
      frames: {
        card: { x: 0, y: 0, width: 1440, height: 900, order: 0, ...flags.card },
        hero: {
          x: 1520,
          y: 0,
          width: 1440,
          height: 900,
          order: 1,
          ...flags.hero,
        },
      },
    }),
  })
}

const sized = (width: number, height: number): ContentSize => ({
  width,
  height,
  contentWidth: width,
  empty: false,
})

describe('createHug', () => {
  let board: TempBoard

  afterEach(() => {
    board.cleanup()
  })

  const entries = () =>
    JSON.parse(
      readFileSync(join(board.root, 'studio/home/layout.json'), 'utf8'),
    ).frames

  it('measures the hugging frames it is given and writes their sizes', async () => {
    board = boardOf({ card: { hugWidth: true, hugHeight: true } })
    const measured: string[] = []
    const hug = createHug({
      root: board.root,
      measure: async (frame: FrameRecord) => {
        measured.push(frame.ref)
        return sized(320, 1232)
      },
    })

    const written = await hug.now(await scanBoard(board.root), [CARD, HERO])

    expect(written).toBe(true)
    expect(measured).toEqual([CARD])
    expect(entries().card).toMatchObject({ width: 320, height: 1232 })
  })

  it('keeps a screen width and hugs its height', async () => {
    board = boardOf({ hero: { hugHeight: true } })
    const hug = createHug({
      root: board.root,
      measure: async () => sized(1600, 1232),
    })

    await hug.now(await scanBoard(board.root), [HERO])

    expect(entries().hero).toMatchObject({ width: 1440, height: 1232 })
  })

  it('writes nothing for a frame whose size already stands', async () => {
    board = boardOf({ card: { hugHeight: true } })
    const hug = createHug({
      root: board.root,
      measure: async () => sized(1440, 900),
    })

    await expect(hug.now(await scanBoard(board.root), [CARD])).resolves.toBe(
      false,
    )
  })

  it('answers true for a board scanned before another write stored the size', async () => {
    board = boardOf({ card: { hugHeight: true } })
    const scanned = await scanBoard(board.root)
    const hug = createHug({
      root: board.root,
      measure: async () => sized(1440, 1232),
    })
    await hug.now(await scanBoard(board.root), [CARD])

    await expect(hug.now(scanned, [CARD])).resolves.toBe(true)
  })

  it.each([
    ['an empty body', async () => ({ ...sized(16, 16), empty: true })],
    [
      'content sized off the viewport',
      async () => {
        throw new FrameboardError('fit-unbounded', 'Grows with the viewport.')
      },
    ],
    [
      'a browser that does not launch',
      async () => {
        throw new FrameboardError('browser-not-found', 'No browser.')
      },
    ],
  ])('keeps the box for %s', async (_label, measure) => {
    board = boardOf({ card: { hugHeight: true } })
    const hug = createHug({ root: board.root, measure })

    const written = await hug.now(await scanBoard(board.root), [CARD])

    expect(written).toBe(false)
    expect(entries().card).toMatchObject({ height: 900, hugHeight: true })
  })

  it('stops measuring once the browser does not launch', async () => {
    board = boardOf({
      card: { hugHeight: true },
      hero: { hugHeight: true },
    })
    let calls = 0
    const hug = createHug({
      root: board.root,
      measure: async () => {
        calls += 1
        throw new FrameboardError('browser-not-found', 'No browser.')
      },
    })

    await hug.now(await scanBoard(board.root), [CARD, HERO])

    expect(calls).toBe(1)
  })

  it('writes what it queued later without holding the caller', async () => {
    board = boardOf({ card: { hugHeight: true } })
    let release: () => void = () => {}
    const gate = new Promise<void>((resolve) => {
      release = resolve
    })
    const hug = createHug({
      root: board.root,
      measure: async () => {
        await gate
        return sized(1440, 1232)
      },
    })

    hug.later(await scanBoard(board.root), [CARD])
    expect(entries().card.height).toBe(900)
    release()

    await expect.poll(() => entries().card.height).toBe(1232)
  })

  describe('linked widths', () => {
    const LINKED = [
      { width: 834, height: 1194 },
      { width: 390, height: 844 },
    ]

    /** A measure reading 1000 px at the frame's own box and 3000 less the width at a linked one. */
    function measuredAt(boxes: (number | undefined)[]) {
      return async (
        _frame: FrameRecord,
        box?: { width: number; height: number },
      ) => {
        boxes.push(box?.width)
        return sized(box?.width ?? 1440, box ? 3000 - box.width : 1000)
      }
    }

    it('now answers once the own box is written, and writes each width after', async () => {
      board = boardOf({ card: { hugHeight: true, widths: LINKED } })
      let release: () => void = () => {}
      const gate = new Promise<void>((resolve) => {
        release = resolve
      })
      const boxes: (number | undefined)[] = []
      const read = measuredAt(boxes)
      const hug = createHug({
        root: board.root,
        measure: async (frame, box) => {
          if (box) await gate
          return read(frame, box)
        },
      })

      await hug.now(await scanBoard(board.root), [CARD])
      const before = entries().card
      release()

      expect([before.height, before.widths]).toEqual([1000, LINKED])
      await expect
        .poll(() => entries().card.widths)
        .toEqual([
          { width: 834, height: 2166 },
          { width: 390, height: 2610 },
        ])
      expect(entries().card.height).toBe(1000)
    })

    it('later measures the own box and each width at its reference height', async () => {
      board = boardOf({ card: { hugHeight: true, widths: LINKED } })
      const heights: number[] = []
      const hug = createHug({
        root: board.root,
        measure: async (frame, box) => {
          heights.push((box ?? frame.box).height)
          return sized(1440, 1000)
        },
      })

      hug.later(await scanBoard(board.root), [CARD])

      await expect.poll(() => heights).toEqual([900, 1194, 844])
    })

    it('measures no width on a frame holding a fixed height', async () => {
      board = boardOf({ card: { hugWidth: true, widths: LINKED } })
      const boxes: (number | undefined)[] = []
      const hug = createHug({ root: board.root, measure: measuredAt(boxes) })

      hug.later(await scanBoard(board.root), [CARD])

      await expect.poll(() => boxes).toEqual([undefined])
      expect(entries().card.widths).toEqual(LINKED)
    })
  })

  it('stores no size for a frame whose file changed after the board it measured', async () => {
    board = boardOf({
      card: { hugHeight: true },
      hero: { hugHeight: true },
    })
    let release: () => void = () => {}
    const gate = new Promise<void>((resolve) => {
      release = resolve
    })
    const hug = createHug({
      root: board.root,
      measure: async (frame: FrameRecord) => {
        if (frame.ref === HERO) return sized(1440, 1300)
        await gate
        return sized(1440, 1232)
      },
    })
    hug.later(await scanBoard(board.root), [CARD])
    const card = join(board.root, 'studio/home/card.html')
    writeFileSync(card, '<p>card, rewritten</p>')
    const later = new Date(Date.now() + 60_000)
    utimesSync(card, later, later)
    release()

    // The hero queues behind the card, so its size lands after the card's run.
    hug.later(await scanBoard(board.root), [HERO])

    await expect.poll(() => entries().hero.height).toBe(1300)
    expect(entries().card.height).toBe(900)
  })

  it('stores no size for a frame whose file changed while a later frame measured', async () => {
    board = boardOf({
      card: { hugHeight: true },
      hero: { hugHeight: true },
    })
    let reached: () => void = () => {}
    const heroMeasuring = new Promise<void>((resolve) => {
      reached = resolve
    })
    let release: () => void = () => {}
    const gate = new Promise<void>((resolve) => {
      release = resolve
    })
    const hug = createHug({
      root: board.root,
      measure: async (frame: FrameRecord) => {
        if (frame.ref === CARD) return sized(1440, 1232)
        reached()
        await gate
        return sized(1440, 1300)
      },
    })
    hug.later(await scanBoard(board.root), [CARD, HERO])
    await heroMeasuring
    const card = join(board.root, 'studio/home/card.html')
    writeFileSync(card, '<p>card, rewritten</p>')
    const later = new Date(Date.now() + 60_000)
    utimesSync(card, later, later)
    release()

    await expect.poll(() => entries().hero.height).toBe(1300)
    expect(entries().card.height).toBe(900)
  })
})

describe('writtenSinceLayout', () => {
  let board: TempBoard

  afterEach(() => {
    board.cleanup()
  })

  it('names a hugging frame written after its layout, and no other', async () => {
    board = boardOf({
      card: { hugHeight: true },
      hero: { hugHeight: true },
    })
    const at = (seconds: number) =>
      new Date(Date.UTC(2026, 9, 25, 0, 0, seconds))
    utimesSync(join(board.root, 'studio/home/layout.json'), at(10), at(10))
    utimesSync(join(board.root, 'studio/home/card.html'), at(20), at(20))
    utimesSync(join(board.root, 'studio/home/hero.html'), at(5), at(5))

    const refs = await writtenSinceLayout(await scanBoard(board.root))

    expect(refs).toEqual([CARD])
  })

  it('names no frame that does not hug, however new its file', async () => {
    board = boardOf()
    const at = (seconds: number) =>
      new Date(Date.UTC(2026, 9, 25, 0, 0, seconds))
    utimesSync(join(board.root, 'studio/home/layout.json'), at(10), at(10))
    utimesSync(join(board.root, 'studio/home/card.html'), at(20), at(20))

    await expect(
      writtenSinceLayout(await scanBoard(board.root)),
    ).resolves.toEqual([])
  })
})

describe('ownFileRefs', () => {
  let board: TempBoard

  afterEach(() => {
    board.cleanup()
  })

  it('names the frames whose own file the batch wrote', async () => {
    board = boardOf()
    const scanned = await scanBoard(board.root)

    const refs = ownFileRefs(scanned, [
      join(board.root, 'studio/home/card.html'),
      join(board.root, 'studio/assets/logo.svg'),
    ])

    expect(refs).toEqual([CARD])
  })
})
