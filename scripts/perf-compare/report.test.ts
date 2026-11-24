import { describe, expect, it } from 'vitest'

import {
  median,
  type Round,
  roundOrder,
  type StartValues,
  summarize,
  type WriteValues,
} from './report'

const START: StartValues = {
  addressMs: 100,
  boardMs: 200,
  quietMs: 300,
  cpuMs: 400,
}
const WRITE: WriteValues = { taskMs: 10, scriptMs: 5, messages: 2, bytes: 1000 }

function round(
  side: Round['side'],
  start: Partial<StartValues> = {},
  writes: Partial<WriteValues>[] = [{}],
): Round {
  return {
    side,
    start: { ...START, ...start },
    writes: writes.map((write) => ({ ...WRITE, ...write })),
  }
}

function lineOf(report: string, ...cells: string[]): string | undefined {
  return report
    .split('\n')
    .find((line) => cells.every((cell) => line.includes(`| ${cell} |`)))
}

const SIDES = { base: 'aaaa1111', head: 'bbbb2222' }

describe('median', () => {
  it('takes the middle of an odd count in any order', () => {
    expect(median([30, 10, 20])).toBe(20)
  })

  it('takes the mean of the middle two of an even count', () => {
    expect(median([40, 10, 20, 30])).toBe(25)
  })

  it('counts a value not reached as the largest', () => {
    expect(median([10, null, 30])).toBe(30)
  })

  it('has no answer with a value not reached in the middle', () => {
    expect(median([null, 10, null])).toBeNull()
  })

  it('has no answer with no value', () => {
    expect(median([])).toBeNull()
  })
})

describe('roundOrder', () => {
  it('alternates which side a round starts with', () => {
    expect([1, 2, 3].map(roundOrder)).toEqual([
      ['base', 'head'],
      ['head', 'base'],
      ['base', 'head'],
    ])
  })
})

describe('summarize', () => {
  it('names both sides and sets their medians beside the change', () => {
    const report = summarize(SIDES, [
      round('base', { addressMs: 100 }),
      round('head', { addressMs: 50 }),
      round('head', { addressMs: 70 }),
      round('base', { addressMs: 140 }),
    ])

    expect(report).toContain('`aaaa1111`')
    expect(report).toContain('`bbbb2222`')
    expect(lineOf(report, '120', '60', '-50%')).toContain('address')
  })

  it('lists every value of a side by its round', () => {
    const report = summarize(SIDES, [
      round('base', { quietMs: 5100 }),
      round('head', {}),
      round('head', {}),
      round('base', { quietMs: 5300 }),
    ])

    expect(lineOf(report, 'base', '5100', '5300')).toBeDefined()
  })

  it('takes the median over every write of every round', () => {
    const report = summarize(SIDES, [
      round('base', {}, [{ taskMs: 10 }, { taskMs: 90 }]),
      round('head', {}, [{ taskMs: 7 }]),
      round('base', {}, [{ taskMs: 30 }]),
    ])

    expect(lineOf(report, '30', '7', '-77%')).toContain('thread')
    expect(lineOf(report, 'base', '10, 90', '30')).toBeDefined()
  })

  it('says a value was not reached and compares nothing with it', () => {
    const report = summarize(SIDES, [
      round('base', { quietMs: null, cpuMs: null }),
      round('head', {}),
    ])

    expect(lineOf(report, 'not reached', '300', 'n/a')).toContain('quiet')
  })

  it('says a round measured no write', () => {
    const report = summarize(SIDES, [
      round('base', {}, []),
      round('head', {}, [{ taskMs: 7 }]),
      round('base', {}, [{ taskMs: 9 }]),
    ])

    expect(lineOf(report, 'base', 'not reached', '9')).toBeDefined()
    expect(lineOf(report, '9', '7', '-22%')).toContain('thread')
  })

  it('gives no percentage off a base of nothing', () => {
    const report = summarize(SIDES, [
      round('base', {}, [{ messages: 0 }]),
      round('head', {}, [{ messages: 3 }]),
    ])

    expect(lineOf(report, '0', '3', 'n/a')).toContain('messages')
  })
})
