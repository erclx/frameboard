import { type Command, InvalidArgumentError } from 'commander'

import { resolveProject } from '@/server/board/refs'
import {
  DEFAULT_MODEL_SIZE,
  fetchModel,
  modelById,
  POLYHAVEN_SOURCE,
  polyhavenLicense,
  type PolyHavenModel,
  searchModels,
} from '@/server/sourcing/polyhaven'
import { savedStem, saveModel } from '@/server/sourcing/save'
import { FrameboardError } from '@/shared/errors'
import {
  MODEL_SIZES,
  type ModelFind,
  type ModelSize,
  type SavedModel,
} from '@/shared/records/sourcing'

import {
  act,
  addVerb,
  boardOf,
  type CommonOptions,
  type ProgramContext,
} from '../program'

interface FindOptions extends CommonOptions {
  save?: string
  size?: ModelSize
  name?: string
}

const CREDIT = `Models from ${POLYHAVEN_SOURCE.name}, ${POLYHAVEN_SOURCE.url}, CC0`

export function registerModel(program: Command, context: ProgramContext): void {
  const { io } = context
  const send = io.fetch ?? fetch
  const model = program
    .command('model')
    .description(
      "Find a public domain 3D model and save it into a project's assets as one GLB with its license",
    )

  act<FindOptions>(
    addVerb(
      model,
      'find',
      "Search Poly Haven's CC0 models, writing nothing unless --save names a result",
      { project: true },
    )
      .argument('<query>', 'what the model shows')
      .option(
        '--save <number-or-id>',
        "save the result with this number, or the Poly Haven model with this id, into the project's assets",
      )
      .option(
        '--size <size>',
        `the texture size saved, one of ${MODEL_SIZES.join(', ')}, ${DEFAULT_MODEL_SIZE} by default`,
        parseSize,
      )
      .option(
        '--name <stem>',
        'the saved file name without its extension, the query by default',
      ),
    context,
    async ([query = ''], options) => {
      if (options.save === undefined) {
        for (const flag of ['name', 'size'] as const) {
          if (options[flag] !== undefined) {
            throw new FrameboardError('usage', `--${flag} needs --save.`)
          }
        }
        const results = await searchModels(query, send)
        const record: ModelFind = {
          version: 1,
          query,
          source: { ...POLYHAVEN_SOURCE },
          results,
        }
        return {
          data: record,
          human:
            results.length === 0
              ? `No ${POLYHAVEN_SOURCE.name} model matches ${query}`
              : [
                  ...results.map(
                    (each) =>
                      `${each.number}\t${each.sizes.at(-1) ?? '-'}\t${each.name}\t${each.id}`,
                  ),
                  CREDIT,
                ].join('\n'),
        }
      }

      // Resolved ahead of the search, so a missing project spends no request.
      const stem = savedStem(options.name, query, 'model')
      const project = await resolveProject(
        await boardOf(options, io),
        options.project,
      )
      const size = options.size ?? DEFAULT_MODEL_SIZE
      const chosen = await pick(query, options.save)
      const packed = await fetchModel(chosen.model.id, size, send)
      const saved = await saveModel(
        project,
        stem,
        packed.bytes,
        polyhavenLicense(
          chosen.model,
          chosen.query,
          { url: packed.url, size },
          new Date(),
        ),
      )
      return { data: saved, human: savedLine(saved) }
    },
  )

  /** The model `--save` names: a number reruns the search, anything else is an id. */
  async function pick(
    query: string,
    save: string,
  ): Promise<{ model: PolyHavenModel; query: string | null }> {
    if (!/^\d+$/.test(save)) {
      return { model: await modelById(save, send), query: null }
    }
    const number = Number(save)
    const results = await searchModels(query, send)
    const found = results.find((each) => each.number === number)
    if (found === undefined) {
      throw new FrameboardError(
        'result-not-found',
        `The search for ${query} found ${results.length} results, so there is no result ${number}.`,
        { number, results: results.length },
      )
    }
    return { model: found, query }
  }
}

function parseSize(value: string): ModelSize {
  const size = MODEL_SIZES.find((each) => each === value)
  if (size === undefined) {
    throw new InvalidArgumentError(`Expected one of ${MODEL_SIZES.join(', ')}.`)
  }
  return size
}

function savedLine(saved: SavedModel): string {
  return `Saved assets/${saved.path} into ${saved.project} from ${POLYHAVEN_SOURCE.name}, its license in assets/${saved.licensePath}`
}
