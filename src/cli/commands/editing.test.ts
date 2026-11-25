import { rmSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { bezelBox, deviceForWidth } from '@/shared/frame-device'
import type { Claim, ClaimBox } from '@/shared/records/claims'

import { cli, type CliRun } from '../../../test/support/cli'
import {
  copyFixtureBoard,
  type FixtureBoard,
} from '../../../test/support/fixture-board'

function claimOf(result: CliRun): Claim {
  return (result.json().data as { claim: Claim }).claim
}

function claimsOf(result: CliRun): Claim[] {
  return (result.json().data as { claims: Claim[] }).claims
}

function framesOf(claims: Claim[]): string[] {
  return claims.map((each) => each.frame)
}

/** The body a box lands in, the box itself with no device. */
function bodyOf(box: ClaimBox | undefined): ClaimBox {
  const at = box ?? { x: NaN, y: NaN, width: NaN, height: NaN }
  return bezelBox(
    at,
    at.showDevice ? deviceForWidth(at.width) : null,
    'upright',
  )
}

function rightOf(body: ClaimBox | undefined): number {
  return body ? body.x + body.width : NaN
}

describe('editing', () => {
  let board: FixtureBoard

  beforeEach(() => {
    board = copyFixtureBoard('basic')
  })

  afterEach(() => {
    vi.unstubAllEnvs()
    board.cleanup()
  })

  function editing(args: string[]) {
    return cli(['editing', ...args, '--json'], { cwd: board.root })
  }

  it('claims a frame for the session in the environment, by its full ref', async () => {
    vi.stubEnv('CLAUDE_CODE_SESSION_ID', 'sess-a')

    const result = await editing(['webapp/home/hero'])

    expect(result.exitCode).toBe(0)
    expect(claimOf(result)).toMatchObject({
      frame: 'webapp/home/hero',
      session: 'sess-a',
      agent: 'claude',
    })
  })

  it('names the agent --agent gives in the claim and its tag', async () => {
    const result = await editing([
      'webapp/home/hero',
      '--session',
      'sess-a',
      '--agent',
      'codex',
    ])

    expect(claimOf(result).agent).toBe('codex')
    expect(claimOf(result).tag).toMatch(/^codex · /)
  })

  it('renews its own claim keeping the time it was first claimed', async () => {
    const first = await editing(['webapp/home/hero', '--session', 'sess-a'])

    const second = await editing(['webapp/home/hero', '--session', 'sess-a'])

    expect(second.exitCode).toBe(0)
    expect(claimOf(second).claimedAt).toBe(claimOf(first).claimedAt)
  })

  it('refuses a frame another session holds as frame-claimed, exit 4, naming the holder', async () => {
    await editing(['webapp/home/hero', '--session', 'sess-a'])

    const result = await editing(['webapp/home/hero', '--session', 'sess-b'])

    expect(result.exitCode).toBe(4)
    expect(result.json().error).toMatchObject({
      code: 'frame-claimed',
      details: { frame: 'webapp/home/hero', session: 'sess-a' },
    })
  })

  it('releases the claim so another session can take the frame', async () => {
    await editing(['webapp/home/hero', '--session', 'sess-a'])

    const released = await editing([
      'webapp/home/hero',
      '--release',
      '--session',
      'sess-a',
    ])
    const taken = await editing(['webapp/home/hero', '--session', 'sess-b'])

    expect(
      (released.json().data as { released: Claim[] }).released,
    ).toHaveLength(1)
    expect(taken.exitCode).toBe(0)
  })

  it('lists the live claims when given no frame', async () => {
    await editing(['webapp/home/hero', '--session', 'sess-a'])
    await editing(['webapp/home/about', '--session', 'sess-b'])

    const result = await editing([])

    expect(
      (result.json().data as { claims: Claim[] }).claims.map(
        (each) => each.frame,
      ),
    ).toEqual(['webapp/home/hero', 'webapp/home/about'])
  })

  it('refuses a frame that does not exist as frame-not-found, exit 3', async () => {
    const result = await editing(['webapp/home/missing', '--session', 'sess-a'])

    expect(result.exitCode).toBe(3)
    expect(result.json().error?.code).toBe('frame-not-found')
  })

  describe('--release of several frames', () => {
    function releasedOf(result: CliRun): string[] {
      return framesOf((result.json().data as { released: Claim[] }).released)
    }

    function release(refs: string[], session = 'sess-a') {
      return editing([...refs, '--release', '--session', session])
    }

    async function held(): Promise<string[]> {
      return framesOf(claimsOf(await editing([])))
    }

    beforeEach(async () => {
      await editing([
        'webapp/home/one',
        'webapp/home/two',
        'webapp/home/three',
        '--new',
        '--session',
        'sess-a',
      ])
    })

    it('drops each frame named, written or reserved, and keeps the rest', async () => {
      await editing(['webapp/home/hero', '--session', 'sess-a'])

      const result = await release(['webapp/home/one', 'webapp/home/hero'])

      expect(result.exitCode).toBe(0)
      expect(releasedOf(result)).toEqual([
        'webapp/home/one',
        'webapp/home/hero',
      ])
      expect(await held()).toEqual(['webapp/home/two', 'webapp/home/three'])
    })

    it('refuses every wrong name at once as frame-not-found, exit 3, dropping none', async () => {
      const result = await release([
        'webapp/home/one',
        'webapp/home/missing',
        'home/gone',
        '--project',
        'webapp',
      ])

      expect(result.exitCode).toBe(3)
      expect(result.json().error).toMatchObject({
        code: 'frame-not-found',
        details: { refs: ['webapp/home/missing', 'webapp/home/gone'] },
      })
      expect(await held()).toEqual([
        'webapp/home/one',
        'webapp/home/two',
        'webapp/home/three',
      ])
    })

    it('leaves a claim another session holds, answering the ones it dropped', async () => {
      await editing(['webapp/home/hero', '--session', 'sess-b'])

      const result = await release(['webapp/home/one', 'webapp/home/hero'])

      expect(result.exitCode).toBe(0)
      expect(releasedOf(result)).toEqual(['webapp/home/one'])
      expect(await held()).toContain('webapp/home/hero')
    })

    it('answers one claim for a frame named twice', async () => {
      const result = await release(['webapp/home/one', 'webapp/home/one'])

      expect(releasedOf(result)).toEqual(['webapp/home/one'])
    })
  })

  describe('--new', () => {
    it('reserves each frame in one row past every placed frame, answering { claims }', async () => {
      const result = await editing([
        'webapp/home/one',
        'webapp/home/two',
        '--new',
        '--width',
        '400',
        '--height',
        '300',
        '--session',
        'sess-a',
      ])

      expect(result.exitCode).toBe(0)
      expect(
        claimsOf(result).map((each) => [each.frame, each.box?.x, each.box?.y]),
      ).toEqual([
        ['webapp/home/one', 1990, 0],
        ['webapp/home/two', 2470, 0],
      ])
      expect(claimsOf(result)[0]?.box).toMatchObject({
        width: 400,
        height: 300,
        hugWidth: false,
        hugHeight: false,
      })
    })

    it('claims a reserved frame not written yet, marking it as the one drawing', async () => {
      await editing([
        'webapp/home/one',
        'webapp/home/two',
        '--new',
        '--session',
        'sess-a',
      ])

      const result = await editing(['webapp/home/two', '--session', 'sess-a'])

      expect(result.exitCode).toBe(0)
      expect(claimOf(result)).toMatchObject({
        frame: 'webapp/home/two',
        box: expect.objectContaining({ x: expect.any(Number) }),
        drawingAt: expect.any(String),
      })
    })

    it('releases a reserved frame not written yet by its ref', async () => {
      await editing(['webapp/home/one', '--new', '--session', 'sess-a'])

      const result = await editing([
        'webapp/home/one',
        '--release',
        '--session',
        'sess-a',
      ])

      expect(result.exitCode).toBe(0)
      expect(
        (result.json().data as { released: Claim[] }).released.map(
          (each) => each.frame,
        ),
      ).toEqual(['webapp/home/one'])
    })

    it('starts the row at --x and --y', async () => {
      const result = await editing([
        'webapp/home/one',
        'webapp/home/two',
        '--new',
        '--size',
        'phone',
        '--x',
        '-500',
        '--y',
        '2000',
        '--session',
        'sess-a',
      ])

      const [one, two] = claimsOf(result)
      expect(one?.box).toMatchObject({ x: -500, y: 2000, hugHeight: true })
      expect(two?.box?.x).toBe(-500 + (one?.box?.width ?? 0) + 80)
    })

    it('starts a second set past the boxes the first reserved', async () => {
      await editing([
        'webapp/home/one',
        '--new',
        '--width',
        '400',
        '--height',
        '300',
        '--session',
        'sess-a',
      ])

      const result = await editing([
        'webapp/home/two',
        '--new',
        '--width',
        '400',
        '--height',
        '300',
        '--session',
        'sess-b',
      ])

      expect(claimsOf(result)[0]?.box?.x).toBe(2470)
    })

    describe('with no size, by a -<px> name', () => {
      function reserve(refs: string[], ...args: string[]) {
        return editing([...refs, '--new', ...args, '--session', 'sess-a'])
      }

      async function boxOf(ref: string, ...args: string[]) {
        const [claim] = claimsOf(await reserve([ref], ...args))
        return claim?.box
      }

      it.each([
        ['one-390', 390],
        ['one-834', 834],
        ['one-1440', 1440],
      ])('reserves %s %i wide in its device', async (name, width) => {
        const box = await boxOf(`webapp/home/${name}`)

        expect(box).toMatchObject({
          width,
          height: 900,
          hugWidth: false,
          hugHeight: true,
          showDevice: true,
        })
      })

      it.each(['one-2', 'one-2024'])(
        'hugs both axes of %s at the default size, with no device',
        async (name) => {
          const box = await boxOf(`webapp/home/${name}`)

          expect(box).toEqual({
            x: 1990,
            y: 0,
            width: 1440,
            height: 900,
            hugWidth: true,
            hugHeight: true,
          })
        },
      )

      it.each([
        ['--size', ['--size', 'tablet'], { width: 834, hugWidth: false }],
        ['--width', ['--width', '1280'], { width: 1280, hugWidth: false }],
        [
          '--height',
          ['--height', '600'],
          { width: 1440, height: 600, hugWidth: true },
        ],
      ])('takes %s over the name', async (_flag, args, reserved) => {
        const box = await boxOf('webapp/home/one-390', ...args)

        expect(box).toMatchObject(reserved)
        expect(box).not.toHaveProperty('showDevice')
      })

      it('leaves the name unread where an entry left by a missing file stands', async () => {
        const ref = 'webapp/home/one-390'
        await cli(['frame', 'add', ref], { cwd: board.root })
        await cli(['frame', 'device', ref, 'off'], { cwd: board.root })
        rmSync(join(board.root, `${ref}.html`))

        const box = await boxOf(ref)

        expect(box).toMatchObject({ width: 1440, hugWidth: true })
        expect(box).not.toHaveProperty('showDevice')
      })

      it('places the first frame where frame add would, with room for its body', async () => {
        const box = await boxOf('webapp/home/one-390')

        expect(box?.x).toBe(2010)
      })

      it('starts an empty page at 0', async () => {
        await cli(['page', 'add', 'webapp/empty'], { cwd: board.root })

        const box = await boxOf('webapp/empty/one-390')

        expect(box?.x).toBe(0)
      })

      it('reads the name on a page whose layout does not parse', async () => {
        writeFileSync(join(board.root, 'webapp/home/layout.json'), '{')

        const box = await boxOf('webapp/home/one-390')

        expect(box).toMatchObject({ width: 390, showDevice: true })
      })

      it('starts the row at --x exactly, device or none', async () => {
        const box = await boxOf('webapp/home/one-390', '--x', '-500')

        expect(box?.x).toBe(-500)
      })

      it('stands each frame of a mixed row the gap past the last body', async () => {
        const claims = claimsOf(
          await reserve([
            'webapp/home/one-390',
            'webapp/home/one-1440',
            'webapp/home/plain',
            'webapp/home/one-834',
          ]),
        )

        const bodies = claims.map(({ box }) => bodyOf(box))
        expect(
          bodies.slice(1).map((body, index) => body.x - rightOf(bodies[index])),
        ).toEqual([80, 80, 80])
      })

      it('starts a second set past the body the first reserved', async () => {
        const first = await boxOf('webapp/home/one-1440')

        const second = await boxOf('webapp/home/two-390')

        expect(bodyOf(second).x - rightOf(bodyOf(first))).toBe(80)
      })

      it('lands in the device through a renewal and frame add', async () => {
        const ref = 'webapp/home/one-390'
        await reserve([ref])
        await editing([ref, '--session', 'sess-a'])

        const added = await cli(['frame', 'add', ref, '--json'], {
          cwd: board.root,
        })

        expect(added.json().data).toMatchObject({
          box: { x: 2010, width: 390 },
          device: 'phone',
        })
      })
    })

    it('refuses an existing frame among new ones as name-taken, reserving none', async () => {
      const result = await editing([
        'webapp/home/hero',
        'webapp/home/one',
        '--new',
        '--session',
        'sess-a',
      ])

      expect(result.exitCode).toBe(4)
      expect(result.json().error).toMatchObject({
        code: 'name-taken',
        details: { refs: ['webapp/home/hero'] },
      })
      expect(claimsOf(await editing([]))).toEqual([])
    })
  })

  it('refuses two refs with no --new as usage, exit 2', async () => {
    const result = await editing([
      'webapp/home/hero',
      'webapp/home/about',
      '--session',
      'sess-a',
    ])

    expect(result.exitCode).toBe(2)
    expect(result.json().error?.code).toBe('usage')
  })

  it('refuses a claim with no session as session-required, exit 2', async () => {
    vi.stubEnv('CLAUDE_CODE_SESSION_ID', '')

    const result = await editing(['webapp/home/hero'])

    expect(result.exitCode).toBe(2)
    expect(result.json().error?.code).toBe('session-required')
  })
})
