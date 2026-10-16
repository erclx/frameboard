import type { Command } from 'commander'

import {
  resolveFrameRef,
  resolvePageRef,
  resolveProject,
} from '@/server/board/refs'
import { FRAME_EXTENSION } from '@/server/board/scan'
import { checkFrame } from '@/server/checks/frame'
import { checkPage, checkProject } from '@/server/checks/run'
import { FrameboardError } from '@/shared/errors'
import type { CheckResult, Finding } from '@/shared/records/check'

import {
  act,
  addVerb,
  boardOf,
  type CommonOptions,
  type ProgramContext,
} from '../program'

const NOT_FOUND = new Set([
  'project-not-found',
  'page-not-found',
  'frame-not-found',
])

export function registerCheck(program: Command, context: ProgramContext): void {
  const command = addVerb(
    program,
    'check',
    'Report every content rule a frame, page, or project breaks, exiting 8 on any finding',
    { project: true },
  ).argument(
    '[target]',
    'a frame ref, a page ref, or a path to the .html file, else the whole project',
  )

  act<CommonOptions>(command, context, async ([target], options) => {
    const root = await boardOf(options, context.io)
    const result = await run(root, target, options, context.io.cwd)
    if (result.findings.length > 0) {
      throw new FrameboardError('check-findings', describe(result), {
        ...result,
      })
    }
    return { data: result, human: describe(result) }
  })
}

async function run(
  root: string,
  target: string | undefined,
  options: CommonOptions,
  cwd: string,
): Promise<CheckResult> {
  const refOptions = { project: options.project, cwd }
  if (target === undefined) {
    const project = await resolveProject(root, options.project)
    return checkProject(root, project.name)
  }
  const parts = target.split('/')
  if (target.endsWith(FRAME_EXTENSION) || parts.length === 3) {
    return checkFrame(await resolveFrameRef(root, target, refOptions))
  }
  if (parts.length === 1) {
    const page = await resolvePageRef(root, target, refOptions)
    return checkPage(root, page.project, page.page)
  }
  // Two parts read as `<page>/<frame>` first and `<project>/<page>` second.
  try {
    return checkFrame(await resolveFrameRef(root, target, refOptions))
  } catch (frameError) {
    if (
      !(frameError instanceof FrameboardError) ||
      !NOT_FOUND.has(frameError.code)
    ) {
      throw frameError
    }
    try {
      const page = await resolvePageRef(root, target, refOptions)
      return checkPage(root, page.project, page.page)
    } catch {
      throw frameError
    }
  }
}

/** One line per finding, as `path:line:column  rule  message`, then a count. */
function describe({ checked, findings }: CheckResult): string {
  const frames = `${checked} frame${checked === 1 ? '' : 's'}`
  if (findings.length === 0) return `Checked ${frames}, no findings.`
  return [
    ...findings.map(line),
    `Checked ${frames}, ${findings.length} finding${findings.length === 1 ? '' : 's'}.`,
  ].join('\n')
}

function line(finding: Finding): string {
  const at = finding.location
    ? `${finding.path}:${finding.location.line}:${finding.location.column}`
    : finding.path
  return `${at}  ${finding.rule}  ${finding.message}`
}
