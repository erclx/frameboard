import type { Command } from 'commander'

import { findLiveServer } from '@/server/address'
import { FrameboardError } from '@/shared/errors'
import type { SelectionResult } from '@/shared/records/selection'

import { getFromBoard } from '../board-server'
import {
  act,
  addVerb,
  boardOf,
  type CommonOptions,
  type ProgramContext,
} from '../program'

export function registerSelection(
  program: Command,
  context: ProgramContext,
): void {
  const { io } = context
  const command = addVerb(
    program,
    'selection',
    "Report the frames and element selected on the open board, the element in the address 'edit' takes",
  )

  act<CommonOptions>(command, context, async (_args, options) => {
    const root = await boardOf(options, io)
    // The selection lives in the running server alone, so there is none to read without one.
    const live = await findLiveServer(root)
    if (!live) {
      throw new FrameboardError(
        'server-not-running',
        `No frameboard server is running for ${root}. Run frameboard serve first.`,
        { root },
      )
    }
    const data = (await getFromBoard(live, '/api/selection')) as SelectionResult
    return { data, human: describe(data) }
  })
}

function describe({ frames, element }: SelectionResult): string {
  if (frames.length === 0) return 'Nothing selected'
  if (!element) return `Selected ${frames.join(', ')}`
  return `Selected ${element.name} <${element.tag}> in ${element.ref}, index ${element.index}, hash ${element.hash}`
}
