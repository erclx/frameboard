import { readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'

import { afterEach, beforeEach, describe, expect, it } from 'vitest'

import { type TempBoard, writeBoard } from '../../../test/support/temp-board'
import { claim, type ClaimFields, readClaims, release } from './store'

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
