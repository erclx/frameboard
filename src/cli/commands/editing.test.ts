import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import type { Claim } from '@/shared/records/claims'

import { cli, type CliRun } from '../../../test/support/cli'
import {
  copyFixtureBoard,
  type FixtureBoard,
} from '../../../test/support/fixture-board'

function claimOf(result: CliRun): Claim {
  return (result.json().data as { claim: Claim }).claim
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

  it('refuses a claim with no session as session-required, exit 2', async () => {
    vi.stubEnv('CLAUDE_CODE_SESSION_ID', '')

    const result = await editing(['webapp/home/hero'])

    expect(result.exitCode).toBe(2)
    expect(result.json().error?.code).toBe('session-required')
  })
})
