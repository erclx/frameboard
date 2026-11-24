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
import { roundOrder, type Side, type SideValues, summarize } from './report'
import { type SideServer, startSide } from './second-start'
import { measureWrites } from './unrelated-write'

const USAGE =
  'Usage: bun scripts/perf-compare/run.ts <baseDir> <headDir> <rounds>'
const MAX_ROUNDS = 20
// A whole board's checks take about nine minutes alone on a four-core runner.
const FIRST_LIMIT_MS = 1_200_000
// Past this a second start is rechecking the whole board, which the first says the length of.
const SECOND_LIMIT_MS = 120_000

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

const started: SideServer[] = []

try {
  // At once, since neither is compared, and each checks the whole board.
  const [baseServer, headServer] = await Promise.all([
    firstStart('base'),
    firstStart('head'),
  ])
  const servers = { base: baseServer, head: headServer }
  const measured: Record<Side, SideValues> = {
    base: { first: baseServer.start, starts: [], writes: [] },
    head: { first: headServer.start, starts: [], writes: [] },
  }
  // On servers already checked, so no write round waits for a start.
  for (const { round, side } of turns()) {
    const { url, start, settle } = servers[side]
    const quiet = start.quietMs !== null
    const writes = quiet ? await measureWrites(url, sides[side].root) : []
    if (quiet) await settle()
    measured[side].writes.push(writes)
    log({ round, side, writes })
  }
  await stopStarted()
  for (const { round, side } of turns()) {
    const { dir, root } = sides[side]
    const { start, stop } = await startSide(dir, root, SECOND_LIMIT_MS)
    await stop()
    measured[side].starts.push(start)
    log({ round, side, start })
  }

  log({ commits, cpus: cpus().length, model: cpus()[0]?.model, measured })
  const report = summarize(commits, measured)
  console.log(report)
  if (process.env.GITHUB_STEP_SUMMARY) {
    appendFileSync(process.env.GITHUB_STEP_SUMMARY, report)
  }
} finally {
  await stopStarted()
  rmSync(scratch, { recursive: true, force: true })
}

async function firstStart(side: Side): Promise<SideServer> {
  const { dir, root } = sides[side]
  mkdirSync(root)
  writeBoard(root)
  const server = await startSide(dir, root, FIRST_LIMIT_MS)
  started.push(server)
  log({ side, first: server.start })
  return server
}

async function stopStarted(): Promise<void> {
  await Promise.all(started.splice(0).map(({ stop }) => stop()))
}

function turns(): { round: number; side: Side }[] {
  return Array.from({ length: rounds }, (_, index) => index + 1).flatMap(
    (round) => roundOrder(round).map((side) => ({ round, side })),
  )
}

function commitOf(dir: string): string {
  return git(dir, ['rev-parse', '--short=8', 'HEAD']).trim()
}

function log(value: object): void {
  console.log(JSON.stringify(value))
}
