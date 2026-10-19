import { join } from 'node:path'

import type { Command } from 'commander'

import { findLiveServer } from '@/server/address'
import {
  resolveFrameRef,
  resolvePageRef,
  resolveProject,
} from '@/server/board/refs'
import {
  FRAME_EXTENSION,
  listFrames,
  listPageFolders,
} from '@/server/board/scan'
import { installCommands } from '@/server/capture/browser'
import { checkFrame } from '@/server/checks/frame'
import type { FrameTarget } from '@/server/checks/frame-source'
import { formatFinding } from '@/server/checks/rule'
import { checkPage, checkProject } from '@/server/checks/run'
import { FrameboardError } from '@/shared/errors'
import type { BrowserRun, CheckResult, Finding } from '@/shared/records/check'

import { postToBoard } from '../board-server'
import {
  act,
  addVerb,
  boardOf,
  type CommonOptions,
  type ProgramContext,
} from '../program'

// The server settles the asked frames before answering, and a startup sweep
// of a large board takes tens of seconds, so the wait outlasts a write's.
const BROWSER_TIMEOUT_MS = 120_000

// A board holding several projects refuses `<page>/<frame>` with no project,
// which is the case the `<project>/<page>` reading exists for.
const NOT_FRAME = new Set([
  'project-required',
  'project-not-found',
  'page-not-found',
  'frame-not-found',
])

export function registerCheck(program: Command, context: ProgramContext): void {
  const command = addVerb(
    program,
    'check',
    'Report every content rule a frame, page, or project breaks, with the browser rules while a server runs, exiting 8 on any error',
    { project: true },
  ).argument(
    '[target]',
    'a frame ref, a page ref, or a path to the .html file, else the whole project',
  )

  act<CommonOptions>(command, context, async ([target], options) => {
    const root = await boardOf(options, context.io)
    const { result: own, refs } = await run(
      root,
      target,
      options,
      context.io.cwd,
    )
    const browser = await browserFindings(root, refs)
    const result: CheckResult = {
      checked: own.checked,
      findings: [...own.findings, ...browser.findings],
      browser: browser.run,
    }
    // A warning, such as a frame sized off the viewport on purpose, never
    // fails a script.
    if (result.findings.some((finding) => finding.severity === 'error')) {
      throw new FrameboardError('check-findings', describe(result), {
        ...result,
      })
    }
    return { data: result, human: describe(result) }
  })
}

/** A static run's result and the refs of every frame it read. */
interface StaticRun {
  result: CheckResult
  refs: string[]
}

async function run(
  root: string,
  target: string | undefined,
  options: CommonOptions,
  cwd: string,
): Promise<StaticRun> {
  const refOptions = { project: options.project, cwd }
  if (target === undefined) {
    const project = await resolveProject(root, options.project)
    return {
      result: await checkProject(root, project.name),
      refs: await projectRefs(root, project.name),
    }
  }
  const parts = target.split('/')
  if (target.endsWith(FRAME_EXTENSION) || parts.length === 3) {
    return frameRun(await resolveFrameRef(root, target, refOptions))
  }
  if (parts.length === 1) {
    return pageRun(root, await resolvePageRef(root, target, refOptions))
  }
  // Two parts read as `<page>/<frame>` first and `<project>/<page>` second.
  try {
    return frameRun(await resolveFrameRef(root, target, refOptions))
  } catch (frameError) {
    if (
      !(frameError instanceof FrameboardError) ||
      !NOT_FRAME.has(frameError.code)
    ) {
      throw frameError
    }
    let page
    try {
      page = await resolvePageRef(root, target, refOptions)
    } catch {
      throw frameError
    }
    return pageRun(root, page)
  }
}

function frameRun(target: FrameTarget): StaticRun {
  return {
    result: checkFrame(target),
    refs: [`${target.project}/${target.page}/${target.name}`],
  }
}

async function pageRun(
  root: string,
  { project, page }: { project: string; page: string },
): Promise<StaticRun> {
  const names = await listFrames(join(root, project, page))
  return {
    result: await checkPage(root, project, page),
    refs: names.map((name) => `${project}/${page}/${name}`),
  }
}

async function projectRefs(root: string, project: string): Promise<string[]> {
  const refs: string[] = []
  for (const page of await listPageFolders(join(root, project))) {
    for (const name of await listFrames(join(root, project, page))) {
      refs.push(`${project}/${page}/${name}`)
    }
  }
  return refs
}

/**
 * The browser findings a running server holds for `refs`, and whether its
 * rules ran. With no server, or one that does not answer, they did not, and
 * the static result stands alone.
 */
async function browserFindings(
  root: string,
  refs: string[],
): Promise<{ findings: Finding[]; run: BrowserRun }> {
  const notRunning = {
    findings: [],
    run: { ran: false, reason: 'server-not-running' as const },
  }
  const live = await findLiveServer(root)
  if (!live) return notRunning
  try {
    const data = (await postToBoard(
      live,
      '/api/checks',
      { refs },
      { timeoutMs: BROWSER_TIMEOUT_MS },
    )) as { findings: Finding[]; browser: BrowserRun }
    return { findings: data.findings, run: data.browser }
  } catch {
    return notRunning
  }
}

/** One line per finding, then a count, then why the browser rules did not run. */
function describe({ checked, findings, browser }: CheckResult): string {
  const frames = `${checked} frame${checked === 1 ? '' : 's'}`
  const lines =
    findings.length === 0
      ? [`Checked ${frames}, no findings.`]
      : [
          ...findings.map(formatFinding),
          `Checked ${frames}, ${findings.length} finding${findings.length === 1 ? '' : 's'}.`,
        ]
  if (browser?.reason === 'server-not-running') {
    lines.push(
      'Browser rules did not run, since no board server is running. Run frameboard serve, then check again.',
    )
  } else if (browser?.reason === 'browser-not-found') {
    lines.push(
      `Browser rules did not run, since the board server could not launch Playwright's headless shell. Install it with ${installCommands().npx}.`,
    )
  }
  return lines.join('\n')
}
