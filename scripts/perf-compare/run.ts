// Usage: bun scripts/perf-compare/run.ts <baseDir> <headDir> <rounds>
// Measures two built checkouts in alternating rounds on generated boards,
// prints the report, and exits 0 whatever it says.
import {
  appendFileSync,
  mkdirSync,
  mkdtempSync,
  realpathSync,
  rmSync,
} from 'node:fs'
import { cpus, tmpdir } from 'node:os'
import { join, resolve } from 'node:path'

import { git } from '../lib/git'
import { writeBoard } from './board'
import { type Round, roundOrder, type Side, summarize } from './report'
import { startSide } from './second-start'
import { measureWrites } from './unrelated-write'

const USAGE =
  'Usage: bun scripts/perf-compare/run.ts <baseDir> <headDir> <rounds>'
const MAX_ROUNDS = 20

const [baseDir, headDir, roundsArg] = process.argv.slice(2)
const rounds = Number(roundsArg)
if (
  !baseDir ||
  !headDir ||
  !Number.isInteger(rounds) ||
  rounds < 1 ||
  rounds > MAX_ROUNDS
) {
  console.error(`${USAGE}, with 1 to ${MAX_ROUNDS} rounds`)
  process.exit(2)
}

const scratch = realpathSync(mkdtempSync(join(tmpdir(), 'perf-compare-')))
const sides = {
  base: { dir: resolve(baseDir), root: join(scratch, 'base') },
  head: { dir: resolve(headDir), root: join(scratch, 'head') },
}
const commits = {
  base: commitOf(sides.base.dir),
  head: commitOf(sides.head.dir),
}

try {
  for (const side of ['base', 'head'] as const) {
    mkdirSync(sides[side].root)
    writeBoard(sides[side].root)
    // Uncounted, since it fills what a second start reads.
    const { start, stop } = await startSide(sides[side].dir, sides[side].root)
    await stop()
    log({ side, round: 'first start', start })
  }

  const measured: Round[] = []
  for (let round = 1; round <= rounds; round += 1) {
    for (const side of roundOrder(round)) {
      const values = await measure(side)
      measured.push(values)
      log({ round, ...values })
    }
  }

  log({ commits, cpus: cpus().length, model: cpus()[0]?.model, measured })
  const report = summarize(commits, measured)
  console.log(report)
  if (process.env.GITHUB_STEP_SUMMARY) {
    appendFileSync(process.env.GITHUB_STEP_SUMMARY, report)
  }
} finally {
  rmSync(scratch, { recursive: true, force: true })
}

async function measure(side: Side): Promise<Round> {
  const { dir, root } = sides[side]
  const server = await startSide(dir, root)
  try {
    const quiet = server.start.quietMs !== null
    const writes = quiet ? await measureWrites(server.url, root) : []
    if (quiet) await server.settle()
    return { side, start: server.start, writes }
  } finally {
    await server.stop()
  }
}

function commitOf(dir: string): string {
  return git(dir, ['rev-parse', '--short=8', 'HEAD']).trim()
}

function log(value: object): void {
  console.log(JSON.stringify(value))
}
