import type { Command } from 'commander'

import { resolveFrameRef } from '@/server/board/refs'
import { removeFrameFile } from '@/server/edit/frame-file'
import { followEdit, notesPath } from '@/server/notes/store'
import { FrameboardError } from '@/shared/errors'
import type { RemoveResult } from '@/shared/records/edit'

import {
  act,
  addVerb,
  boardOf,
  type CommonOptions,
  parseInteger,
  type ProgramContext,
} from '../program'
import { parseHash } from './edit'

type RemoveOptions = CommonOptions & {
  index: number
  hash: string
}

export function registerRemove(
  program: Command,
  context: ProgramContext,
): void {
  const { io } = context
  act<RemoveOptions>(
    addVerb(
      program,
      'remove',
      'Take one element and everything inside it out of a frame, leaving every other byte, refused once the file differs from the hash',
      { project: true },
    )
      .argument(
        '<frame-ref>',
        'a frame ref, <page>/<frame> or <project>/<page>/<frame>, or a path to its .html file',
      )
      .requiredOption(
        '--index <n>',
        "the element's index in document order, under the body",
        parseInteger(0),
      )
      .requiredOption(
        '--hash <hex>',
        'the frame hash the index was read from, as inspect reports it',
        parseHash,
      ),
    context,
    async ([ref = ''], options) => {
      const root = await boardOf(options, io)
      const frame = await resolveFrameRef(root, ref, {
        project: options.project,
        cwd: io.cwd,
      })
      const frameRef = `${frame.project}/${frame.page}/${frame.name}`
      const result = removeFrameFile(frame.path, options.hash, options.index)
      if (!result.ok) {
        throw new FrameboardError(result.reason, result.detail, {
          ref: frameRef,
          index: options.index,
        })
      }
      // A note pinned on the removed element falls back to the frame, and one
      // pinned after it follows its element to the new index.
      await followEdit(
        notesPath(root, frame.project, frame.page),
        frame.name,
        options.hash,
        result.hash,
        result.remap,
      )
      const data: RemoveResult = { ref: frameRef, hash: result.hash }
      return {
        data,
        human: `Removed element ${options.index} of ${frameRef}, now at hash ${result.hash}`,
      }
    },
  )
}
