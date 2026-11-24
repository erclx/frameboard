import { describe, expect, it } from 'vitest'

import { createStartChecks } from './start-checks'

const tick = () => new Promise((resolve) => setTimeout(resolve, 0))

/** A check whose every slice waits until the test lands it. */
function heldCheck() {
  const slices: { refs: string[]; land: () => void; fail: () => void }[] = []
  const check = (refs: string[]) =>
    new Promise<void>((resolve, reject) => {
      slices.push({
        refs,
        land: resolve,
        fail: () => reject(new Error('The board folder is gone.')),
      })
    })
  return { slices, check }
}

describe('createStartChecks', () => {
  it('checks every queued frame in slices, one at a time', async () => {
    const { slices, check } = heldCheck()
    const starting = createStartChecks({ check, size: 2 })

    const running = starting.run(['a', 'b', 'c'])
    await tick()
    const first = slices.map(({ refs }) => refs)
    slices[0]?.land()
    await tick()
    slices[1]?.land()
    await running

    expect(first).toEqual([['a', 'b']])
    expect(slices.map(({ refs }) => refs)).toEqual([['a', 'b'], ['c']])
  })

  it('leaves out a frame checked elsewhere before its slice', async () => {
    const { slices, check } = heldCheck()
    const starting = createStartChecks({ check, size: 1 })
    const running = starting.run(['a', 'b', 'c'])
    await tick()

    starting.drop(['b'])
    slices[0]?.land()
    await tick()
    slices[1]?.land()
    await running

    expect(slices.map(({ refs }) => refs)).toEqual([['a'], ['c']])
  })

  it('leaves out a frame checked elsewhere while its slice waits its turn', async () => {
    const { slices, check } = heldCheck()
    let start: () => void = () => {}
    const inTurn = async (task: () => Promise<void>) => {
      await new Promise<void>((resolve) => {
        start = resolve
      })
      await task()
    }
    const starting = createStartChecks({ check, inTurn, size: 2 })
    void starting.run(['a', 'b', 'c'])
    await tick()

    starting.drop(['a'])
    start()
    await tick()

    expect(slices.map(({ refs }) => refs)).toEqual([['b', 'c']])
  })

  it('checks nothing queued after it closed', async () => {
    const { slices, check } = heldCheck()
    const starting = createStartChecks({ check, size: 1 })

    starting.close()
    await starting.run(['a'])

    expect(slices).toEqual([])
  })

  it('checks a fronted frame in the next slice', async () => {
    const { slices, check } = heldCheck()
    const starting = createStartChecks({ check, size: 1 })
    void starting.run(['a', 'b', 'c'])
    await tick()

    starting.front(['c'])
    slices[0]?.land()
    await tick()

    expect(slices.map(({ refs }) => refs)).toEqual([['a'], ['c']])
  })

  it('settles once the asked frames are checked, with others still waiting', async () => {
    const { slices, check } = heldCheck()
    const starting = createStartChecks({ check, size: 1 })
    void starting.run(['a', 'b'])
    let settled = false
    const settling = starting.settle(['a']).then(() => {
      settled = true
    })
    await tick()
    const beforeLanding = settled

    slices[0]?.land()
    await settling

    expect(beforeLanding).toBe(false)
    expect(settled).toBe(true)
  })

  it('settles at once for a frame it does not hold', async () => {
    const { check } = heldCheck()
    const starting = createStartChecks({ check, size: 1 })

    await expect(starting.settle(['a'])).resolves.toBeUndefined()
  })

  it('goes on past a slice that failed', async () => {
    const { slices, check } = heldCheck()
    const starting = createStartChecks({ check, size: 1 })
    const running = starting.run(['a', 'b'])
    await tick()

    slices[0]?.fail()
    await tick()
    slices[1]?.land()
    await running

    expect(slices.map(({ refs }) => refs)).toEqual([['a'], ['b']])
  })

  it('starts no slice and settles every wait once closed', async () => {
    const { slices, check } = heldCheck()
    const starting = createStartChecks({ check, size: 1 })
    const running = starting.run(['a', 'b'])
    const settling = starting.settle(['b'])
    await tick()

    starting.close()
    slices[0]?.land()
    await Promise.all([running, settling])

    expect(slices.map(({ refs }) => refs)).toEqual([['a']])
  })

  it('waits for its pause ahead of every slice', async () => {
    const { slices, check } = heldCheck()
    let release: () => void = () => {}
    const pause = () =>
      new Promise<void>((resolve) => {
        release = resolve
      })
    const starting = createStartChecks({ check, pause, size: 1 })
    void starting.run(['a'])
    await tick()
    const before = slices.length

    release()
    await tick()

    expect(before).toBe(0)
    expect(slices).toHaveLength(1)
  })
})
