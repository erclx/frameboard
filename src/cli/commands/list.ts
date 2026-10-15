import type { Command } from 'commander'

import { resolveProject } from '@/server/board/refs'
import { scanBoard } from '@/server/board/scan'
import type { ListResult } from '@/shared/records/list'

import {
  act,
  addVerb,
  boardOf,
  type CommonOptions,
  type ProgramContext,
} from '../program'

export function registerList(program: Command, context: ProgramContext): void {
  const command = addVerb(program, 'list', 'List projects, pages, and frames', {
    project: true,
  })

  act<CommonOptions>(command, context, async (_args, options) => {
    const root = await boardOf(options, context.io)
    const project = options.project
      ? (await resolveProject(root, options.project)).name
      : undefined
    const result = await scanBoard(root, { project })
    return { data: result, human: describe(result) }
  })
}

function describe({ root, projects }: ListResult): string {
  const lines = [root]
  for (const project of projects) {
    lines.push(
      `  ${project.name}${project.projectFileError ? `  (${project.projectFileError.message})` : ''}`,
    )
    for (const page of project.pages) {
      lines.push(
        `    ${page.name}${page.layoutError ? `  (${page.layoutError.message})` : ''}`,
      )
      for (const frame of page.frames) {
        const { x, y, width, height } = frame.box
        const flags = [
          frame.placed ? '' : 'unplaced',
          frame.hidden ? 'hidden' : '',
          frame.locked ? 'locked' : '',
        ].filter(Boolean)
        lines.push(
          `      ${frame.name}  ${width}x${height} at ${x},${y}${flags.length ? `  ${flags.join(', ')}` : ''}`,
        )
      }
    }
  }
  return lines.join('\n')
}
