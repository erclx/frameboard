export type Side = 'base' | 'head'

/** What one start took from its spawn, null where its limit came first. */
export interface StartValues {
  addressMs: number
  boardMs: number | null
  quietMs: number | null
  /** CPU time of the server and its browser until quiet, or until the limit. */
  cpuMs: number
}

/** What one write in another project cost the open tab. */
export interface WriteValues {
  taskMs: number
  scriptMs: number
  messages: number
  bytes: number
}

export interface SideValues {
  /** The start that checks the whole board, taken while the other side's does. */
  first: StartValues
  /** One second start a round. */
  starts: StartValues[]
  /** Each round's writes, none where the server never went quiet before them. */
  writes: WriteValues[][]
}

interface Measure {
  label: string
  /** The values of each round. */
  rounds: (side: SideValues) => (number | null)[][]
}

const startMeasure = (label: string, name: keyof StartValues): Measure => ({
  label: `Second start, ${label}`,
  rounds: ({ starts }) => starts.map((start) => [start[name]]),
})

const writeMeasure = (label: string, name: keyof WriteValues): Measure => ({
  label: `Unrelated write, ${label}`,
  rounds: ({ writes }) =>
    writes.map((round) => round.map((write) => write[name])),
})

const MEASURES: Measure[] = [
  startMeasure('address printed (ms)', 'addressMs'),
  startMeasure('first board message (ms)', 'boardMs'),
  startMeasure('quiet (ms)', 'quietMs'),
  startMeasure('CPU until quiet or the limit (ms)', 'cpuMs'),
  writeMeasure('main thread (ms)', 'taskMs'),
  writeMeasure('script (ms)', 'scriptMs'),
  writeMeasure('messages', 'messages'),
  writeMeasure('message bytes', 'bytes'),
]

const SIDES = ['base', 'head'] as const

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
  measured: Record<Side, SideValues>,
): string {
  return [
    `## Base \`${commits.base}\`, head \`${commits.head}\``,
    '',
    '| Median | Base | Head | Change |',
    '| --- | ---: | ---: | ---: |',
    ...MEASURES.map(({ label, rounds }) => {
      const base = median(rounds(measured.base).flat())
      const head = median(rounds(measured.head).flat())
      return row([label, shown(base), shown(head), change(base, head)])
    }),
    '',
    '### Every value',
    ...MEASURES.flatMap(({ label, rounds }) => {
      const headings = rounds(measured.base).map(
        (_, index) => `Round ${index + 1}`,
      )
      return [
        '',
        row([label, ...headings]),
        row(['---', ...headings.map(() => '---:')]),
        ...SIDES.map((side) =>
          row([side, ...rounds(measured[side]).map(listed)]),
        ),
      ]
    }),
    '',
    '### First start, uncounted, both sides at once',
    '',
    '| Side | Quiet (ms) | CPU until quiet or the limit (ms) |',
    '| --- | ---: | ---: |',
    ...SIDES.map((side) => {
      const { quietMs, cpuMs } = measured[side].first
      return row([side, shown(quietMs), shown(cpuMs)])
    }),
    '',
  ].join('\n')
}

function row(cells: readonly string[]): string {
  return `| ${cells.join(' | ')} |`
}

function listed(values: readonly (number | null)[]): string {
  return values.map(shown).join(', ') || shown(null)
}

function shown(value: number | null): string {
  return value === null ? 'not reached' : String(Math.round(value))
}

function change(base: number | null, head: number | null): string {
  if (base === null || head === null || base === 0) return 'n/a'
  const percent = Math.round(((head - base) / base) * 100)
  return `${percent > 0 ? '+' : ''}${percent}%`
}
