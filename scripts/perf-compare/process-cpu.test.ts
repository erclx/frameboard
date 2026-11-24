import { describe, expect, it } from 'vitest'

import { settledFrom, treeOf } from './process-cpu'

/** A `/proc/<pid>/stat` line with the fields a reading takes. */
function statLine({
  pid,
  ppid,
  name = 'node',
  user = 0,
  system = 0,
  reapedUser = 0,
  reapedSystem = 0,
}: {
  pid: number
  ppid: number
  name?: string
  user?: number
  system?: number
  reapedUser?: number
  reapedSystem?: number
}): string {
  return `${pid} (${name}) S ${ppid} ${pid} ${ppid} 0 -1 4194304 90 0 0 0 ${user} ${system} ${reapedUser} ${reapedSystem} 20 0 1 0 803624 5545984 222`
}

describe('treeOf', () => {
  it('adds the time of everything below a process, at ten milliseconds a tick', () => {
    const tree = treeOf(10, [
      statLine({ pid: 10, ppid: 1, user: 3, system: 2 }),
      statLine({ pid: 11, ppid: 10, user: 7 }),
      statLine({ pid: 12, ppid: 11, system: 1 }),
    ])

    expect(tree).toEqual({ pids: [10, 11, 12], cpuMs: 130 })
  })

  it('adds the time of children a process has reaped', () => {
    const tree = treeOf(10, [
      statLine({ pid: 10, ppid: 1, reapedUser: 40, reapedSystem: 5 }),
    ])

    expect(tree.cpuMs).toBe(450)
  })

  it('leaves out a process beside the tree', () => {
    const tree = treeOf(10, [
      statLine({ pid: 10, ppid: 1, user: 1 }),
      statLine({ pid: 20, ppid: 1, user: 99 }),
    ])

    expect(tree).toEqual({ pids: [10], cpuMs: 10 })
  })

  it('reads past a command name holding spaces and parentheses', () => {
    const tree = treeOf(10, [
      statLine({ pid: 10, ppid: 1, name: 'chrome) (gpu', user: 4 }),
    ])

    expect(tree.cpuMs).toBe(40)
  })

  it('holds nothing for a process that has exited', () => {
    expect(treeOf(10, [statLine({ pid: 20, ppid: 1 })])).toEqual({
      pids: [],
      cpuMs: 0,
    })
  })
})

describe('settledFrom', () => {
  const rule = { windowMs: 1000, busyMs: 60, busyShare: 0.3 }

  it('counts the CPU through the quiet window and the time from its start', () => {
    const settled = settledFrom(
      [
        { atMs: 0, cpuMs: 0 },
        { atMs: 500, cpuMs: 400 },
        { atMs: 1000, cpuMs: 410 },
        { atMs: 1500, cpuMs: 420 },
      ],
      rule,
    )

    expect(settled).toEqual({ atMs: 500, cpuMs: 420 })
  })

  it('ends on the last busy step the window still holds', () => {
    const settled = settledFrom(
      [
        { atMs: 400, cpuMs: 300 },
        { atMs: 500, cpuMs: 340 },
        { atMs: 600, cpuMs: 350 },
        { atMs: 1400, cpuMs: 360 },
      ],
      rule,
    )

    expect(settled).toEqual({ atMs: 500, cpuMs: 360 })
  })

  it('names none while the window holds more work than the rule allows', () => {
    const settled = settledFrom(
      [
        { atMs: 0, cpuMs: 0 },
        { atMs: 500, cpuMs: 30 },
        { atMs: 1000, cpuMs: 61 },
      ],
      rule,
    )

    expect(settled).toBeUndefined()
  })

  it('names none before a whole window has passed', () => {
    const settled = settledFrom(
      [
        { atMs: 0, cpuMs: 0 },
        { atMs: 999, cpuMs: 0 },
      ],
      rule,
    )

    expect(settled).toBeUndefined()
  })
})
