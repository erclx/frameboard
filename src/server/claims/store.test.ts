import { readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'

import { afterEach, beforeEach, describe, expect, it } from 'vitest'

import { type TempBoard, writeBoard } from '../../../test/support/temp-board'
import {
  claim,
  type ClaimFields,
  readClaims,
  release,
  releaseReservation,
  reserve,
} from './store'

const NOW = new Date('2026-10-19T10:00:00.000Z')
const MINUTE_LATER = new Date('2026-10-19T10:01:00.000Z')
const SIX_MINUTES_LATER = new Date('2026-10-19T10:06:00.000Z')

function fieldsFor(session: string, frame = 'webapp/home/hero'): ClaimFields {
  return { frame, session, agent: 'claude', tag: `claude · ${session}` }
}

describe('claims store', () => {
  let board: TempBoard

  beforeEach(() => {
    board = writeBoard({})
  })

  afterEach(() => {
    board.cleanup()
  })

  describe('claim', () => {
    it('holds a frame for five minutes from the claim', async () => {
      const held = await claim(board.root, fieldsFor('sess-a'), NOW)

      expect(held).toEqual({
        frame: 'webapp/home/hero',
        session: 'sess-a',
        agent: 'claude',
        tag: 'claude · sess-a',
        claimedAt: '2026-10-19T10:00:00.000Z',
        expiresAt: '2026-10-19T10:05:00.000Z',
      })
    })

    it('keeps the claim time on a renewal and moves only the expiry', async () => {
      await claim(board.root, fieldsFor('sess-a'), NOW)

      const renewed = await claim(board.root, fieldsFor('sess-a'), MINUTE_LATER)

      expect(renewed).toMatchObject({
        claimedAt: '2026-10-19T10:00:00.000Z',
        expiresAt: '2026-10-19T10:06:00.000Z',
      })
      expect(await readClaims(board.root, MINUTE_LATER)).toHaveLength(1)
    })

    it('refuses a frame another session holds live, naming the holder', async () => {
      await claim(board.root, fieldsFor('sess-a'), NOW)

      await expect(
        claim(board.root, fieldsFor('sess-b'), MINUTE_LATER),
      ).rejects.toMatchObject({
        code: 'frame-claimed',
        details: {
          frame: 'webapp/home/hero',
          session: 'sess-a',
          tag: 'claude · sess-a',
          expiresAt: '2026-10-19T10:05:00.000Z',
        },
      })
    })

    it('hands a frame to another session once the old claim expires', async () => {
      await claim(board.root, fieldsFor('sess-a'), NOW)

      const taken = await claim(
        board.root,
        fieldsFor('sess-b'),
        SIX_MINUTES_LATER,
      )

      expect(taken.session).toBe('sess-b')
      expect(await readClaims(board.root, SIX_MINUTES_LATER)).toEqual([taken])
    })

    it('refuses a file that does not parse and leaves it as it was', async () => {
      await claim(board.root, fieldsFor('sess-a'), NOW)
      const path = join(board.root, '.run/claims.json')
      writeFileSync(path, '{ not json')

      await expect(
        claim(board.root, fieldsFor('sess-a'), NOW),
      ).rejects.toMatchObject({ code: 'claims-invalid' })
      expect(readFileSync(path, 'utf8')).toBe('{ not json')
    })
  })

  describe('reserve', () => {
    const holder = { session: 'sess-a', agent: 'claude', tag: 'claude · a' }

    function boxAt(x: number) {
      return { x, y: 0, width: 720, height: 900 }
    }

    function reserveThree(at = NOW) {
      return reserve(
        board.root,
        holder,
        [
          { frame: 'webapp/home/one', box: boxAt(0) },
          { frame: 'webapp/home/two', box: boxAt(800) },
          { frame: 'webapp/home/three', box: boxAt(1600) },
        ],
        at,
      )
    }

    it('writes every frame of the set in one write, each carrying its box and one set id', async () => {
      const made = await reserveThree()

      const read = await readClaims(board.root, NOW)
      expect(read).toEqual(made)
      expect(read.map((each) => each.box?.x)).toEqual([0, 800, 1600])
      expect(new Set(read.map((each) => each.set)).size).toBe(1)
      expect(read[0]?.set).toEqual(expect.any(String))
    })

    it('refuses the whole set when another session holds one frame, writing none', async () => {
      await claim(board.root, fieldsFor('sess-b', 'webapp/home/two'), NOW)

      await expect(reserveThree(MINUTE_LATER)).rejects.toMatchObject({
        code: 'frame-claimed',
        details: { frame: 'webapp/home/two', session: 'sess-b' },
      })
      expect(
        (await readClaims(board.root, MINUTE_LATER)).map((each) => each.frame),
      ).toEqual(['webapp/home/two'])
    })

    it('renews the whole set when one of its frames is claimed again', async () => {
      await reserveThree()

      await claim(
        board.root,
        fieldsFor('sess-a', 'webapp/home/two'),
        MINUTE_LATER,
      )

      const read = await readClaims(
        board.root,
        new Date('2026-10-19T10:05:30.000Z'),
      )
      expect(read.map((each) => each.frame).sort()).toEqual([
        'webapp/home/one',
        'webapp/home/three',
        'webapp/home/two',
      ])
    })

    it('keeps the box and set on a plain claim, stamping when it turned to draw', async () => {
      const [, made] = await reserveThree()

      const renewed = await claim(
        board.root,
        fieldsFor('sess-a', 'webapp/home/two'),
        MINUTE_LATER,
      )

      expect(renewed).toMatchObject({
        box: boxAt(800),
        set: made?.set,
        drawingAt: '2026-10-19T10:01:00.000Z',
      })
    })

    it('keeps the order the set was named in when one member is claimed again', async () => {
      await reserveThree()

      await claim(
        board.root,
        fieldsFor('sess-a', 'webapp/home/one'),
        MINUTE_LATER,
      )

      expect(
        (await readClaims(board.root, MINUTE_LATER)).map((each) => each.frame),
      ).toEqual(['webapp/home/one', 'webapp/home/two', 'webapp/home/three'])
    })

    it('lets the set lapse together five minutes after its last renewal', async () => {
      await reserveThree()

      expect(await readClaims(board.root, SIX_MINUTES_LATER)).toEqual([])
    })
  })

  describe('releaseReservation', () => {
    it('drops another session reservation by frame and leaves its other claims', async () => {
      await reserve(
        board.root,
        { session: 'sess-a', agent: 'claude', tag: 'claude · a' },
        [
          {
            frame: 'webapp/home/one',
            box: { x: 0, y: 0, width: 1, height: 1 },
          },
          {
            frame: 'webapp/home/two',
            box: { x: 9, y: 0, width: 1, height: 1 },
          },
        ],
        NOW,
      )

      const dropped = await releaseReservation(
        board.root,
        'webapp/home/one',
        NOW,
      )

      expect(dropped?.frame).toBe('webapp/home/one')
      expect(
        (await readClaims(board.root, NOW)).map((each) => each.frame),
      ).toEqual(['webapp/home/two'])
    })

    it('leaves a claim with no box in place', async () => {
      await claim(board.root, fieldsFor('sess-a'), NOW)

      const dropped = await releaseReservation(
        board.root,
        'webapp/home/hero',
        NOW,
      )

      expect(dropped).toBeUndefined()
      expect(await readClaims(board.root, NOW)).toHaveLength(1)
    })
  })

  describe('readClaims', () => {
    it('reads a board with no claims file as holding none', async () => {
      expect(await readClaims(board.root, NOW)).toEqual([])
    })

    it('leaves out a claim past its expiry', async () => {
      await claim(board.root, fieldsFor('sess-a'), NOW)

      expect(await readClaims(board.root, SIX_MINUTES_LATER)).toEqual([])
    })
  })

  describe('release', () => {
    it('drops the session claim on the frame named and keeps its others', async () => {
      await claim(board.root, fieldsFor('sess-a'), NOW)
      await claim(board.root, fieldsFor('sess-a', 'shop/cart/total'), NOW)

      const dropped = await release(
        board.root,
        'sess-a',
        'webapp/home/hero',
        NOW,
      )

      expect(dropped.map((each) => each.frame)).toEqual(['webapp/home/hero'])
      expect(
        (await readClaims(board.root, NOW)).map((each) => each.frame),
      ).toEqual(['shop/cart/total'])
    })

    it('drops every claim of the session with no frame, and nobody else', async () => {
      await claim(board.root, fieldsFor('sess-a'), NOW)
      await claim(board.root, fieldsFor('sess-a', 'shop/cart/total'), NOW)
      await claim(board.root, fieldsFor('sess-b', 'webapp/home/footer'), NOW)

      const dropped = await release(board.root, 'sess-a', undefined, NOW)

      expect(dropped).toHaveLength(2)
      expect(
        (await readClaims(board.root, NOW)).map((each) => each.session),
      ).toEqual(['sess-b'])
    })

    it('leaves another session claim on the frame named', async () => {
      await claim(board.root, fieldsFor('sess-a'), NOW)

      const dropped = await release(
        board.root,
        'sess-b',
        'webapp/home/hero',
        NOW,
      )

      expect(dropped).toEqual([])
      expect(await readClaims(board.root, NOW)).toHaveLength(1)
    })
  })
})
