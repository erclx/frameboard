export type Side = 'base' | 'head'

/** What a start on a board this side has started before took, null where it was never reached. */
export interface StartValues {
  addressMs: number
  boardMs: number | null
  quietMs: number | null
  /** CPU time of the server and its browser until it went quiet. */
  cpuMs: number | null
}

/** What one write in another project cost the open tab. */
export interface WriteValues {
  taskMs: number
  scriptMs: number
  messages: number
  bytes: number
}

export interface Round {
  side: Side
  start: StartValues
  /** None where the server never went quiet to measure them on. */
  writes: WriteValues[]
}

interface Measure {
  label: string
  values: (round: Round) => (number | null)[]
}

const MEASURES: Measure[] = [
  {
    label: 'Second start, address printed (ms)',
    values: ({ start }) => [start.addressMs],
  },
  {
    label: 'Second start, first board message (ms)',
    values: ({ start }) => [start.boardMs],
  },
  {
    label: 'Second start, quiet (ms)',
    values: ({ start }) => [start.quietMs],
  },
  {
    label: 'Second start, CPU until quiet (ms)',
    values: ({ start }) => [start.cpuMs],
  },
  {
    label: 'Unrelated write, main thread (ms)',
    values: ({ writes }) => writes.map(({ taskMs }) => taskMs),
  },
  {
    label: 'Unrelated write, script (ms)',
    values: ({ writes }) => writes.map(({ scriptMs }) => scriptMs),
  },
  {
    label: 'Unrelated write, messages',
    values: ({ writes }) => writes.map(({ messages }) => messages),
  },
  {
    label: 'Unrelated write, message bytes',
    values: ({ writes }) => writes.map(({ bytes }) => bytes),
  },
]

/** Which side round `round`, counted from 1, measures first, so neither always runs on the warmer machine. */
export function roundOrder(round: number): [Side, Side] {
  return round % 2 === 1 ? ['base', 'head'] : ['head', 'base']
}

/** A value not reached counts as the largest, and one in the middle leaves no median. */
export function median(values: readonly (number | null)[]): number | null {
  const sorted = values.toSorted((a, b) => (a ?? Infinity) - (b ?? Infinity))
  const lower = sorted[Math.ceil(sorted.length / 2) - 1] ?? null
  const upper = sorted[Math.floor(sorted.length / 2)] ?? null
  return lower === null || upper === null ? null : (lower + upper) / 2
}

/** The run as markdown, the medians first and every value under them. */
export function summarize(
  commits: Record<Side, string>,
  rounds: readonly Round[],
): string {
  const of = (side: Side) => rounds.filter((round) => round.side === side)
  const count = Math.max(of('base').length, of('head').length)
  return [
    `## Base \`${commits.base}\`, head \`${commits.head}\``,
    '',
    '| Median | Base | Head | Change |',
    '| --- | ---: | ---: | ---: |',
    ...MEASURES.map(({ label, values }) => {
      const [base, head] = [
        median(of('base').flatMap(values)),
        median(of('head').flatMap(values)),
      ]
      return row([label, shown(base), shown(head), change(base, head)])
    }),
    '',
    '### Every value',
    ...MEASURES.flatMap(({ label, values }) => [
      '',
      row([
        label,
        ...Array.from({ length: count }, (_, index) => `Round ${index + 1}`),
      ]),
      row(['---', ...Array.from({ length: count }, () => '---:')]),
      ...(['base', 'head'] as const).map((side) =>
        row([
          side,
          ...of(side).map(
            (each) => values(each).map(shown).join(', ') || shown(null),
          ),
        ]),
      ),
    ]),
    '',
  ].join('\n')
}

function row(cells: readonly string[]): string {
  return `| ${cells.join(' | ')} |`
}

function shown(value: number | null): string {
  return value === null ? 'not reached' : String(Math.round(value))
}

function change(base: number | null, head: number | null): string {
  if (base === null || head === null || base === 0) return 'n/a'
  const percent = Math.round(((head - base) / base) * 100)
  return `${percent > 0 ? '+' : ''}${percent}%`
}
