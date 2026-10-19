import { type Command, Option } from 'commander'

import { readFrame } from '@/server/board/frames'
import { withFrameHost } from '@/server/capture/host'
import { inspectFrame } from '@/server/capture/inspect'
import type { InspectResult } from '@/shared/records/inspect'
import type { Theme } from '@/shared/theme'

import {
  act,
  addVerb,
  boardOf,
  type CommonOptions,
  parseInteger,
  type ProgramContext,
} from '../program'

type InspectOptions = CommonOptions & {
  theme: Theme
  index?: number
}

export function registerInspect(
  program: Command,
  context: ProgramContext & { facesDir: string },
): void {
  const { io, facesDir } = context
  act<InspectOptions>(
    addVerb(
      program,
      'inspect',
      "Report each rendered element of a frame with its index, box, and computed color and type, the index being the address 'edit' takes",
      { project: true },
    )
      .argument(
        '<frame-ref>',
        'a frame ref, <page>/<frame> or <project>/<page>/<frame>, or a path to its .html file',
      )
      .addOption(
        new Option('--theme <theme>', 'the theme to read')
          .choices(['light', 'dark'])
          .default('light'),
      )
      .option('--index <n>', 'report this element alone', parseInteger(0)),
    context,
    async ([ref = ''], options) => {
      const root = await boardOf(options, io)
      const frame = await readFrame(root, ref, {
        project: options.project,
        cwd: io.cwd,
      })
      const data: InspectResult = await withFrameHost(
        { root, facesDir },
        'inspect',
        (browser, baseUrl) =>
          inspectFrame(browser, {
            baseUrl,
            frame,
            theme: options.theme,
            index: options.index,
          }),
      )
      return { data, human: describe(data) }
    },
  )
}

function describe(result: InspectResult): string {
  const lines = result.elements.map(
    ({ index, tag, text, box, color, fontSize, fontWeight }) =>
      `${index} <${tag}> ${Math.round(box.x)},${Math.round(box.y)} ${Math.round(box.width)}x${Math.round(box.height)} ${color} ${fontSize} ${fontWeight}${text ? ` "${text}"` : ''}`,
  )
  const note = result.editable
    ? ''
    : '\nThe browser builds an element the file does not state, so edit refuses every index here.'
  return `${result.ref} in ${result.theme}, hash ${result.hash}\n${lines.join('\n')}${note}`
}
