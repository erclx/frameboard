import { afterEach, beforeEach, describe, expect, it } from 'vitest'

import { type TempBoard, writeBoard } from '../../../test/support/temp-board'
import { refuseClaimed } from './gate'
import { claim } from './store'

const NOW = new Date('2026-10-19T10:00:00.000Z')
const MINUTE_LATER = new Date('2026-10-19T10:01:00.000Z')
const SIX_MINUTES_LATER = new Date('2026-10-19T10:06:00.000Z')

describe('refuseClaimed', () => {
  let board: TempBoard

  beforeEach(async () => {
    board = writeBoard({})
    await claim(
      board.root,
      {
        frame: 'webapp/home/hero',
        session: 'sess-a',
        agent: 'claude',
        tag: 'claude · webapp',
      },
      NOW,
    )
  })

  afterEach(() => {
    board.cleanup()
  })

  it('passes a frame nobody holds', async () => {
    await expect(
      refuseClaimed(board.root, ['webapp/home/footer'], MINUTE_LATER),
    ).resolves.toBeUndefined()
  })

  it('refuses a held frame, naming its holder and how long it has held it', async () => {
    await expect(
      refuseClaimed(
        board.root,
        ['webapp/home/footer', 'webapp/home/hero'],
        MINUTE_LATER,
      ),
    ).rejects.toMatchObject({
      code: 'frame-claimed',
      details: {
        frame: 'webapp/home/hero',
        tag: 'claude · webapp',
        claimedAt: '2026-10-19T10:00:00.000Z',
        expiresAt: '2026-10-19T10:05:00.000Z',
      },
    })
  })

  it('refuses a page ref for a claim on a frame under it', async () => {
    await expect(
      refuseClaimed(board.root, ['webapp/home'], MINUTE_LATER),
    ).rejects.toMatchObject({
      code: 'frame-claimed',
      details: { frame: 'webapp/home/hero' },
    })
  })

  it('refuses a project ref for a claim on a frame under it', async () => {
    await expect(
      refuseClaimed(board.root, ['webapp'], MINUTE_LATER),
    ).rejects.toMatchObject({ code: 'frame-claimed' })
  })

  it('passes a page whose name only starts like the claimed one', async () => {
    await expect(
      refuseClaimed(board.root, ['webapp/hom'], MINUTE_LATER),
    ).resolves.toBeUndefined()
  })

  it('passes a claim that has expired', async () => {
    await expect(
      refuseClaimed(board.root, ['webapp/home/hero'], SIX_MINUTES_LATER),
    ).resolves.toBeUndefined()
  })
})
