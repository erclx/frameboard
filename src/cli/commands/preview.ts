import type { Command } from 'commander'

import { findLiveServer } from '@/server/address'
import { resolveFrameRef } from '@/server/board/refs'
import { PREVIEW_PORT } from '@/server/routes/preview'
import { FrameboardError } from '@/shared/errors'
import { type QrModules, qrModules } from '@/shared/qr'
import type { PreviewStart, PreviewStop } from '@/shared/records/preview'

import { deleteFromBoard, postToBoard } from '../board-server'
import {
  act,
  addVerb,
  boardOf,
  type CommonOptions,
  parsePort,
  type ProgramContext,
} from '../program'

interface PreviewOptions extends CommonOptions {
  port?: number
  stop?: boolean
}

/** The light modules a scanner wants around a code, at least four by the standard. */
const QUIET_ZONE = 4

export function registerPreview(
  program: Command,
  context: ProgramContext,
): void {
  const { io } = context
  const command = addVerb(
    program,
    'preview',
    "Open a frame's project on a phone on the same network, read only, through a link and a code the running board serves",
    { project: true },
  )
    .argument(
      '[frame-ref]',
      'the frame the link lands on, <page>/<frame>, <project>/<page>/<frame>, or a path to its .html file',
    )
    .option(
      '--port <n>',
      `the port the link asks for first, taking a free one when it is taken (default: ${PREVIEW_PORT})`,
      parsePort,
    )
    .option('--stop', 'end the open link, so no phone reaches the board')

  act<PreviewOptions>(command, context, async (args, options) => {
    const [ref] = args
    const root = await boardOf(options, io)
    if (options.stop && ref !== undefined) {
      throw new FrameboardError(
        'usage',
        'Pass a frame ref to open a link, or --stop to end one, not both.',
      )
    }
    if (!options.stop && ref === undefined) {
      throw new FrameboardError(
        'usage',
        'Name the frame the link lands on, or pass --stop to end the open link.',
      )
    }
    const frame =
      ref === undefined
        ? null
        : await resolveFrameRef(root, ref, {
            project: options.project,
            cwd: io.cwd,
          })

    // The listener lives in the running server, so it stops with the board.
    const live = await findLiveServer(root)
    if (!live) {
      throw new FrameboardError(
        'server-not-running',
        `No frameboard server is running for ${root}. Run frameboard serve first.`,
        { root },
      )
    }

    if (frame === null) {
      const data = (await deleteFromBoard(
        live,
        '/api/preview',
        {},
      )) as PreviewStop
      return {
        data,
        human: data.stopped ? 'Ended the phone link' : 'No phone link was open',
      }
    }

    const data = (await postToBoard(live, '/api/preview', {
      ref: `${frame.project}/${frame.page}/${frame.name}`,
      ...(options.port === undefined ? {} : { port: options.port }),
    })) as PreviewStart
    return {
      data,
      human: [
        terminalCode(qrModules(data.url)),
        data.url,
        `Scan on the same Wi-Fi. It opens ${data.project} read only until the board stops or frameboard preview --stop runs.`,
      ].join('\n'),
    }
  })
}

/**
 * The code drawn two rows to a line in half blocks, black on a forced white
 * ground, so it scans on a dark terminal as on a light one.
 */
export function terminalCode(modules: QrModules): string {
  const size = modules.length + QUIET_ZONE * 2
  const dark = (x: number, y: number) =>
    modules[y - QUIET_ZONE]?.[x - QUIET_ZONE] ?? false
  const lines: string[] = []
  for (let y = 0; y < size; y += 2) {
    let line = ''
    for (let x = 0; x < size; x++) {
      const top = dark(x, y)
      const bottom = dark(x, y + 1)
      line += top && bottom ? '█' : top ? '▀' : bottom ? '▄' : ' '
    }
    lines.push(`\x1b[30;47m${line}\x1b[0m`)
  }
  return lines.join('\n')
}
