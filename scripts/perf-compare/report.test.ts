import { describe, expect, it } from 'vitest'

import {
  median,
  roundOrder,
  type SideValues,
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

function values({
  first = {},
  starts = [{}],
  writes = [[{}]],
}: {
  first?: Partial<StartValues>
  starts?: Partial<StartValues>[]
  writes?: Partial<WriteValues>[][]
} = {}): SideValues {
  return {
    first: { ...START, ...first },
    starts: starts.map((start) => ({ ...START, ...start })),
    writes: writes.map((round) =>
      round.map((write) => ({ ...WRITE, ...write })),
    ),
  }
}

function lineOf(report: string, ...cells: string[]): string | undefined {
  return report
    .split('\n')
    .find((line) => line.includes(`| ${cells.join(' | ')} |`))
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
    const report = summarize(SIDES, {
      base: values({ starts: [{ addressMs: 100 }, { addressMs: 140 }] }),
      head: values({ starts: [{ addressMs: 50 }, { addressMs: 70 }] }),
    })

    expect(report).toContain('`aaaa1111`')
    expect(report).toContain('`bbbb2222`')
    expect(lineOf(report, '120', '60', '-50%')).toContain('address')
  })

  it('lists every value of a side by its round', () => {
    const report = summarize(SIDES, {
      base: values({ starts: [{ quietMs: 5100 }, { quietMs: 5300 }] }),
      head: values({ starts: [{}, {}] }),
    })

    expect(lineOf(report, 'base', '5100', '5300')).toBeDefined()
  })

  it('takes the median over every write of every round', () => {
    const report = summarize(SIDES, {
      base: values({
        writes: [[{ taskMs: 10 }, { taskMs: 90 }], [{ taskMs: 30 }]],
      }),
      head: values({ writes: [[{ taskMs: 7 }], [{ taskMs: 7 }]] }),
    })

    expect(lineOf(report, '30', '7', '-77%')).toContain('thread')
    expect(lineOf(report, 'base', '10, 90', '30')).toBeDefined()
  })

  it('says a value was not reached and compares nothing with it', () => {
    const report = summarize(SIDES, {
      base: values({ starts: [{ quietMs: null }] }),
      head: values(),
    })

    expect(lineOf(report, 'not reached', '300', 'n/a')).toContain('quiet')
  })

  it('says a round measured no write', () => {
    const report = summarize(SIDES, {
      base: values({ writes: [[], [{ taskMs: 9 }]] }),
      head: values({ writes: [[{ taskMs: 7 }], [{ taskMs: 7 }]] }),
    })

    expect(lineOf(report, 'base', 'not reached', '9')).toBeDefined()
    expect(lineOf(report, '9', '7', '-22%')).toContain('thread')
  })

  it('gives no percentage off a base of nothing', () => {
    const report = summarize(SIDES, {
      base: values({ writes: [[{ messages: 0 }]] }),
      head: values({ writes: [[{ messages: 3 }]] }),
    })

    expect(lineOf(report, '0', '3', 'n/a')).toContain('messages')
  })

  it('lists each first start apart from the medians', () => {
    const report = summarize(SIDES, {
      base: values({ first: { quietMs: 520_000, cpuMs: 935_000 } }),
      head: values({ first: { quietMs: null, cpuMs: 941_000 } }),
    })

    expect(lineOf(report, 'base', '520000', '935000')).toBeDefined()
    expect(lineOf(report, 'head', 'not reached', '941000')).toBeDefined()
  })
})
