import { type Command, InvalidArgumentError, Option } from 'commander'

import { resolveProject } from '@/server/board/refs'
import { listFonts } from '@/server/fonts/installed'
import { removeFont } from '@/server/fonts/remove'
import {
  DEFAULT_WEIGHTS,
  fetchFamilies,
  FONTSOURCE_SOURCE,
  installFont,
  searchFamilies,
} from '@/server/sourcing/fontsource'
import { FrameboardError } from '@/shared/errors'
import {
  FONT_CATEGORIES,
  FONT_LICENSES,
  type FontCategory,
} from '@/shared/fonts'
import type { FontFind } from '@/shared/records/sourcing'

import {
  act,
  addVerb,
  boardOf,
  type CommonOptions,
  type ProgramContext,
} from '../program'

interface FindOptions extends CommonOptions {
  category?: FontCategory
  save?: string
  weights?: number[]
}

const CREDIT = `Fonts from ${FONTSOURCE_SOURCE.name}, ${FONTSOURCE_SOURCE.url}`

export function registerFont(program: Command, context: ProgramContext): void {
  const { io } = context
  const send = io.fetch ?? fetch
  const font = program
    .command('font')
    .description(
      "Find an openly licensed font and install it into a project's assets with its license, list the ones a project holds, or remove one",
    )

  act<FindOptions>(
    addVerb(
      font,
      'find',
      `Search Fontsource's families under ${FONT_LICENSES.join(', ')}, writing nothing unless --save names one. Refuses license-refused for a family under any other license, and name-taken for one the project holds`,
      { project: true },
    )
      .argument('[query]', 'a family name or a category')
      .addOption(
        new Option(
          '--category <category>',
          'keep the families of one category, which needs no query',
        ).choices(FONT_CATEGORIES),
      )
      .option(
        '--save <number-or-id>',
        "install the result with this number, or the Fontsource family with this id, into the project's assets/fonts/<id>/",
      )
      .option(
        '--weights <weights>',
        `the weights kept of a static family, as 300,700, ${DEFAULT_WEIGHTS.join(' and ')} by default, while a variable one keeps every weight`,
        parseWeights,
      ),
    context,
    async ([query], options) => {
      if (options.save === undefined) {
        if (options.weights !== undefined) {
          throw new FrameboardError('usage', '--weights needs --save.')
        }
        const found = await search(query, options.category)
        return { data: found, human: findLines(found) }
      }

      // Resolved ahead of the search, so a missing project spends no request.
      const project = await resolveProject(
        await boardOf(options, io),
        options.project,
      )
      const chosen = await pick(options.save, query, options.category)
      const saved = await installFont(
        project,
        { ...chosen, weights: options.weights, savedAt: new Date() },
        send,
      )
      const { family, license, licenseFile, faces } = saved.license
      return {
        data: saved,
        human: `Installed ${family} into ${saved.project} as ${faces.length} files in assets/${saved.path}/, its ${license} license in ${licenseFile}. A frame names it as font-family: '${family}'`,
      }
    },
  )

  act<CommonOptions>(
    addVerb(
      font,
      'list',
      'List the fonts a project installed, each with its license and the frames drawing text in it',
      { project: true },
    ),
    context,
    async (_args, options) => {
      const list = await listFonts(await boardOf(options, io), options.project)
      return {
        data: list,
        human:
          list.fonts.length === 0
            ? `${list.project} has installed no font`
            : list.fonts
                .map(
                  (each) =>
                    `${each.id}\t${each.family}\t${each.license}\t${counted(each.frames)}`,
                )
                .join('\n'),
      }
    },
  )

  act<CommonOptions>(
    addVerb(
      font,
      'remove',
      'Take an installed font out of a project, deleting its folder under assets/fonts/ and naming the frames left falling back, whose files it never changes. Refuses font-not-found for one the project has not installed',
      { project: true },
    ).argument('<id>', 'a font `font list` names'),
    context,
    async ([id = ''], options) => {
      const removed = await removeFont(
        await boardOf(options, io),
        options.project,
        id,
      )
      const taken = `Removed ${removed.family} from ${removed.project}`
      return {
        data: removed,
        human:
          removed.frames.length === 0
            ? taken
            : `${taken}. ${counted(removed.frames)} still naming it: ${removed.frames.join(', ')}`,
      }
    },
  )

  async function search(
    query: string | undefined,
    category: FontCategory | undefined,
  ): Promise<FontFind> {
    if (query === undefined && category === undefined) {
      throw new FrameboardError(
        'usage',
        'Name a family to find, or pass --category.',
      )
    }
    const asked = { query: query ?? null, category: category ?? null }
    return {
      version: 1,
      ...asked,
      licenses: [...FONT_LICENSES],
      source: { ...FONTSOURCE_SOURCE },
      ...searchFamilies(await fetchFamilies(send), asked),
    }
  }

  /** The family `--save` names: a number reruns the search, anything else is an id. */
  async function pick(
    save: string,
    query: string | undefined,
    category: FontCategory | undefined,
  ): Promise<{ id: string; query: string | null }> {
    if (!/^\d+$/.test(save)) return { id: save, query: null }
    const number = Number(save)
    const { results } = await search(query, category)
    const found = results.find((each) => each.number === number)
    if (found === undefined) {
      throw new FrameboardError(
        'result-not-found',
        `The search found ${results.length} results, so there is no result ${number}.`,
        { number, results: results.length },
      )
    }
    return { id: found.id, query: query ?? null }
  }
}

function parseWeights(value: string): number[] {
  const weights = value.split(',').map((each) => Number(each.trim()))
  if (!weights.every((each) => Number.isInteger(each) && each > 0)) {
    throw new InvalidArgumentError('Expected weights such as 300,700.')
  }
  return weights
}

function findLines({ query, category, total, results }: FontFind): string {
  if (results.length === 0) {
    return `No ${FONTSOURCE_SOURCE.name} family matches ${query ?? category}`
  }
  return [
    ...results.map(
      (each) =>
        `${each.number}\t${each.license}\t${each.category}\t${each.family}\t${each.id}`,
    ),
    ...(total > results.length ? [`${results.length} of ${total} shown`] : []),
    CREDIT,
  ].join('\n')
}

function counted(frames: readonly string[]): string {
  return `${frames.length} ${frames.length === 1 ? 'frame' : 'frames'}`
}
