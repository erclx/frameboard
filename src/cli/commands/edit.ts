import { type Command, InvalidArgumentError } from 'commander'

import { resolveFrameRef } from '@/server/board/refs'
import type { EditChange } from '@/server/edit/apply'
import { editFrameFile } from '@/server/edit/frame-file'
import { FrameboardError } from '@/shared/errors'
import type { EditResult } from '@/shared/records/edit'

import {
  act,
  addVerb,
  boardOf,
  type CommonOptions,
  parseInteger,
  type ProgramContext,
} from '../program'

export type EditOptions = CommonOptions & {
  index: number
  hash?: string
  style?: string
  attr?: string
  text?: string
}

function parseHash(value: string): string {
  if (!/^[0-9a-f]{64}$/.test(value)) {
    throw new InvalidArgumentError('Expected a SHA-256 hash in lowercase hex.')
  }
  return value
}

/** Splits `name=value` at its first `=`, since a value may hold one of its own. */
function pair(flag: string, value: string): [string, string] {
  const equals = value.indexOf('=')
  if (equals <= 0) {
    throw new FrameboardError('usage', `${flag} takes <name>=<value>.`, {
      [flag]: value,
    })
  }
  return [value.slice(0, equals), value.slice(equals + 1)]
}

/** The one change the flags name, refusing none or several as a usage error. */
export function changeOf(options: EditOptions): EditChange {
  const given = [options.style, options.attr, options.text].filter(
    (value) => value !== undefined,
  )
  if (given.length !== 1) {
    throw new FrameboardError(
      'usage',
      'Give exactly one of --style, --attr, or --text.',
    )
  }
  if (options.style !== undefined) {
    const [property, value] = pair('--style', options.style)
    return { kind: 'style', property, value }
  }
  if (options.attr !== undefined) {
    const [name, value] = pair('--attr', options.attr)
    return { kind: 'attribute', name, value }
  }
  return { kind: 'text', value: options.text ?? '' }
}

export function registerEdit(program: Command, context: ProgramContext): void {
  const { io } = context
  act<EditOptions>(
    addVerb(
      program,
      'edit',
      'Set one inline style declaration, attribute, or text on one element of a frame, leaving every other byte',
      { project: true },
    )
      .argument(
        '<frame-ref>',
        'a frame ref, <page>/<frame> or <project>/<page>/<frame>, or a path to its .html file',
      )
      .requiredOption(
        '--index <n>',
        "the element's index in document order",
        parseInteger(0),
      )
      .option(
        '--hash <hex>',
        'the frame hash the index was read from, refused once the file differs',
        parseHash,
      )
      .option(
        '--style <property=value>',
        'set one declaration, or drop it with an empty value',
      )
      .option('--attr <name=value>', 'set one attribute')
      .option(
        '--text <value>',
        'replace the text of an element holding text alone',
      ),
    context,
    async ([ref = ''], options) => {
      const change = changeOf(options)
      const frame = await resolveFrameRef(await boardOf(options, io), ref, {
        project: options.project,
        cwd: io.cwd,
      })
      const frameRef = `${frame.project}/${frame.page}/${frame.name}`
      const result = editFrameFile(
        frame.path,
        { index: options.index, hash: options.hash },
        change,
      )
      if (!result.ok) {
        throw new FrameboardError(result.reason, result.detail, {
          ref: frameRef,
          index: options.index,
        })
      }
      const data: EditResult = {
        ref: frameRef,
        index: options.index,
        hash: result.hash,
      }
      return {
        data,
        human: `Edited element ${options.index} of ${frameRef}, now at hash ${result.hash}`,
      }
    },
  )
}
