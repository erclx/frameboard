import type { Command } from 'commander'

import { findLiveServer } from '@/server/address'
import { resolveFrameRef } from '@/server/board/refs'
import { boardUrl } from '@/shared/board-urls'
import { FrameboardError } from '@/shared/errors'

import { postToBoard } from '../board-server'
import {
  act,
  addVerb,
  boardOf,
  type CommonOptions,
  type ProgramContext,
} from '../program'

export function registerShow(program: Command, context: ProgramContext): void {
  const { io } = context
  const command = addVerb(program, 'show', 'Point the open board at a frame', {
    project: true,
  }).argument(
    '<frame-ref>',
    'a frame ref, <page>/<frame> or <project>/<page>/<frame>, or a path to its .html file',
  )

  act<CommonOptions>(command, context, async ([ref = ''], options) => {
    const root = await boardOf(options, io)
    const frame = await resolveFrameRef(root, ref, {
      project: options.project,
      cwd: io.cwd,
    })
    const frameRef = `${frame.project}/${frame.page}/${frame.name}`

    // Showing needs a board to point, and starting a server is serve's job alone.
    const live = await findLiveServer(root)
    if (!live) {
      throw new FrameboardError(
        'server-not-running',
        `No frameboard server is running for ${root}. Run frameboard serve first.`,
        { root },
      )
    }
    const { tabs } = (await postToBoard(live, '/api/show', {
      ref: frameRef,
    })) as { tabs: number }

    return {
      data: {
        ref: frameRef,
        url: `${live.url}${boardUrl(frame.project, frame.page)}`,
        tabs,
      },
      human:
        tabs > 0
          ? `Showing ${frameRef} on the open board`
          : `No board tab is open to show ${frameRef}. Run frameboard serve to open one.`,
    }
  })
}
